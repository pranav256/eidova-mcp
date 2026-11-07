// Local MCP telemetry tap [BD-206]. When MCP_DEBUG_LOG is set to a file path,
// every MCP tool exchange is appended there as one JSONL line: timestamp, tool,
// the full arguments the host sent (the prompt/context), output preview,
// duration, status, client. Tail it live while driving a test session:
//
//   MCP_DEBUG_LOG=/tmp/mcp-tap.jsonl bun dev        # server side
//   bun run --cwd packages/mcp tap                  # pretty live viewer
//
// Strictly dev-only: the env var is never set in prod, and node:fs is loaded
// dynamically inside the guard so workerd (Cloudflare Worker) never imports it.

import { hasProcess, type JsonValue } from "./guards";

export interface McpDebugEntry {
  ts: string;
  transport: "remote" | "stdio";
  tool: string;
  args: Record<string, JsonValue | undefined>;
  durationMs?: number | null;
  status: "ok" | "error";
  errorMessage?: string;
  outputPreview?: string | null;
  clientName?: string | null;
  clientVersion?: string | null;
  userId?: string | null;
  auth?: string | null;
}

export function mcpDebugLogPath(): string | undefined {
  return hasProcess() ? process.env?.MCP_DEBUG_LOG : undefined;
}

/**
 * Append one exchange to the tap file. No-op unless MCP_DEBUG_LOG is set.
 * Returns the write promise so a Worker caller can hand it to
 * `fireAndForget`/`waitUntil`; a tap failure never rejects (caught inside).
 */
export function mcpDebugLog(entry: McpDebugEntry): Promise<void> {
  const path = mcpDebugLogPath();
  if (!path) return Promise.resolve();
  return import("node:fs")
    .then((fs) => fs.appendFileSync(path, `${JSON.stringify(entry)}\n`))
    .catch(() => {
      // Dev-only tap: a bad path must never break the tool call it observes.
    });
}
