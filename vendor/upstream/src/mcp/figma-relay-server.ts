import { type IncomingMessage, createServer, type Server } from "node:http"

import type { ZodType } from "zod"

import { FIGMA_RELAY_PORT, FigmaRelayQueue, POLL_HOLD_MS, relayResultSchema } from "./figma-relay.js";

/**
 * The local relay between a coding agent and the Better Design plugin running
 * in Figma. Only a plugin inside Figma can read a Figma file, so the panel
 * holds a poll open here and the agent's request travels down it.
 *
 * It is plain HTTP on one loopback port, because the plugin's panel already
 * polls a local port this way and Figma's sandbox allows it without a new
 * dependency. Nothing but the plugin and this machine's agent can reach it.
 * [BD-741]
 */

/** A relay that is listening, and the handle that stops it. */
export interface FigmaRelay {
  queue: FigmaRelayQueue;
  port: number;
  close: () => Promise<void>;
}

const CORS = {
  // The plugin's panel is an iframe with a null origin, so it cannot be named.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * The request body, parsed by the schema the caller names. Every body on this
 * relay has a schema, so nothing untyped reaches the queue.
 */
async function readBody<T>(request: IncomingMessage, schema: ZodType<T>): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    // SAFETY: an IncomingMessage with no encoding set yields Buffer chunks.
    chunks.push(chunk as Buffer);
  }
  return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}

/**
 * Starts the relay, or returns null when the port is already taken, which
 * means another agent session on this machine owns it.
 */
export async function startFigmaRelay(port = FIGMA_RELAY_PORT): Promise<FigmaRelay | null> {
  const queue = new FigmaRelayQueue();
  // One timer closes out whatever ran out of time: a poll is answered empty so
  // the plugin polls again, a request fails so the agent hears why.
  const sweeper = setInterval(() => queue.sweep(), 1_000);
  sweeper.unref?.();

  const server: Server = createServer(async (request, response) => {
    Object.entries(CORS).forEach(([name, value]) => response.setHeader(name, value));
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    try {
      if (request.method === "GET" && request.url?.startsWith("/pending")) {
        // The poll carries the file, so a plugin that opened before this relay
        // did is still seen as connected. [BD-741]
        const file = new URL(request.url, "http://localhost").searchParams.get("file");
        const next = await queue.poll(file ? { file } : undefined);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(next ?? null));
        return;
      }
      if (request.method === "POST" && request.url === "/result") {
        queue.settle(await readBody(request, relayResultSchema));
        response.writeHead(204).end();
        return;
      }
      response.writeHead(404).end();
    } catch (error) {
      response.writeHead(400).end(String(error));
    }
  });
  // A poll is held open for longer than Node's default header timeout allows.
  server.headersTimeout = POLL_HOLD_MS + 10_000;
  server.requestTimeout = POLL_HOLD_MS + 10_000;

  const listening = await new Promise<boolean>((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => resolve(true));
  });
  if (!listening) {
    clearInterval(sweeper);
    return null;
  }
  // The relay must not hold a finished MCP session open.
  server.unref();

  return {
    queue,
    port,
    close: () => new Promise<void>((resolve) => {
      clearInterval(sweeper);
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  };
}
