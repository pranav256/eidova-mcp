import { z } from "zod"

import type { ModelPrompt } from "./figma-model-prompt"

/**
 * The local model the Figma model step can call itself: any OpenAI-compatible
 * chat server, Gemma on Ollama by default, so the step runs offline. Every
 * other run uses no provider at all: the calling agent writes the page on its
 * own plan (figma-model-handoff.ts), so no tool asks for a hosted API key.
 *
 * The adapter uses plain `fetch`. The stdio server ships on npm as one
 * bundle, and a single call does not justify a new runtime dependency for
 * every install. [BD-866]
 */

/** What a model said, and whether it stopped because it ran out of room. */
export interface ModelReply {
  text: string
  truncated: boolean
  inputTokens?: number
  outputTokens?: number
}

/** A model the Figma step can ask: one prompt in, one reply out. */
export interface ModelProvider {
  model: string
  complete(prompt: ModelPrompt, options?: { signal?: AbortSignal }): Promise<ModelReply>
}

/** A model call that failed for a reason the designer or the agent can act on. */
export class ModelProviderError extends Error {
  override name = "ModelProviderError"
}

/** The local model used when the tool names none. */
export const DEFAULT_LOCAL_MODEL = "gemma4:latest"

/** Where a local OpenAI-compatible server listens when nothing else is set: Ollama's default port. */
export const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1"

/** Room for a whole dashboard page and its report; a reply that hits it is flagged as truncated. */
const MAX_OUTPUT_TOKENS = 16_000

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

const chatReplySchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
})

const chatChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ content: z.string().nullable().optional() }).optional(),
    finish_reason: z.string().nullable().optional(),
  })).optional(),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullable().optional(),
  // vLLM, llama.cpp and Ollama send an error event when generation fails mid-stream.
  // Some servers send the reason as a string, others as { message }; both become one string here.
  error: z
    .union([z.string(), z.object({ message: z.string().optional() }).transform((error) => error.message ?? "no reason given")])
    .optional(),
})

/** Largest streamed reply kept: a whole page is tens of kilobytes, so more than this is not one. */
const MAX_STREAM_CHARS = 2_000_000

/** Joins a streamed chat reply: each `data:` line carries a piece of the text, the last ones the stop reason and usage. */
async function readStream(response: Response, label: string): Promise<ModelReply> {
  const reply: ModelReply = { text: "", truncated: false }
  if (!response.body) throw new ModelProviderError(`${label} sent an empty stream.`)
  const decoder = new TextDecoder()
  let pending = ""
  // A stream that closes before a stop reason or [DONE] was cut off, so the page is flagged, not trusted.
  let finished = false
  const take = (line: string) => {
    const data = line.trim()
    if (!data.startsWith("data:")) return
    const payload = data.slice(5).trim()
    if (payload === "[DONE]") finished = true
    if (!payload || payload === "[DONE]") return
    const chunk = chatChunkSchema.parse(JSON.parse(payload))
    if (chunk.error !== undefined) {
      throw new ModelProviderError(`${label} stopped: ${chunk.error.slice(0, 200)}`)
    }
    for (const choice of chunk.choices ?? []) {
      reply.text += choice.delta?.content ?? ""
      if (choice.finish_reason) finished = true
      if (choice.finish_reason === "length") reply.truncated = true
    }
    if (chunk.usage) {
      reply.inputTokens = chunk.usage.prompt_tokens
      reply.outputTokens = chunk.usage.completion_tokens
    }
  }
  for await (const bytes of response.body) {
    pending += decoder.decode(bytes, { stream: true })
    const lines = pending.split("\n")
    pending = lines.pop() ?? ""
    lines.forEach(take)
    if (pending.length + reply.text.length > MAX_STREAM_CHARS) {
      throw new ModelProviderError(`${label} sent more than a page: over ${MAX_STREAM_CHARS} characters.`)
    }
  }
  take(pending + decoder.decode())
  if (!finished) reply.truncated = true
  return reply
}

/**
 * A server named for a reader: its origin and path, never the user name,
 * password or query a configured URL can carry.
 */
function serverLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    // Not silent: the label still names which setting to check.
    return "the server in BETTER_DESIGN_MODEL_BASE_URL"
  }
}

const errorCodeSchema = z.object({ code: z.string() })

/** Sends one request, turning a network failure into a message that names the server and nothing secret. */
async function post(send: FetchLike, url: string, label: string, init: RequestInit): Promise<Response> {
  try {
    return await send(url, init)
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ModelProviderError(`${label} did not answer in time.`)
    }
    // Node puts the system error code, such as ECONNREFUSED, on the cause.
    const cause = errorCodeSchema.safeParse(error instanceof Error ? error.cause : undefined)
    const code = cause.success ? ` (${cause.data.code})` : ""
    throw new ModelProviderError(`Could not reach ${label}${code}. Is the server running?`)
  }
}

async function failure(label: string, response: Response): Promise<ModelProviderError> {
  const body = await response.text().catch(() => "")
  // Error bodies name the problem ("model not found", "invalid x-api-key");
  // they never echo the key, and a long one is cut so it cannot flood a reply.
  return new ModelProviderError(`${label} answered ${response.status}: ${body.slice(0, 300) || response.statusText}`)
}

/** The chat completions endpoint under a base URL, keeping any query the server needs. */
function chatCompletionsUrl(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    // Not silent: the tool reports this message instead of calling a model.
    throw new ModelProviderError("BETTER_DESIGN_MODEL_BASE_URL is not a valid URL.")
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/chat/completions`
  return url.toString()
}

/** Any OpenAI-compatible chat endpoint; the image travels as a data URL. */
export function openAiCompatibleProvider(options: { baseUrl: string; model: string; apiKey?: string; fetch?: FetchLike }): ModelProvider {
  const send = options.fetch ?? fetch
  const url = chatCompletionsUrl(options.baseUrl)
  const label = serverLabel(url)
  return {
    model: options.model,
    async complete(prompt, { signal } = {}) {
      const content = [
        { type: "text", text: prompt.text },
        ...(prompt.image ? [{ type: "image_url", image_url: { url: `data:image/png;base64,${prompt.image}` } }] : []),
      ]
      const headers = new Headers({ "content-type": "application/json" })
      if (options.apiKey) headers.set("authorization", `Bearer ${options.apiKey}`)
      const response = await post(send, url, label, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: options.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // A large frame can take a local model minutes. Without a stream the
          // server sends no headers until the page is done, and the runtime's
          // 300 s header timeout ends the call first. [BD-1056]
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content },
          ],
        }),
        signal,
      })
      if (!response.ok) throw await failure(label, response)
      // A server that ignores `stream` answers with one JSON body, read as before.
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        const reply = chatReplySchema.parse(await response.json())
        const [choice] = reply.choices
        return {
          text: choice.message.content ?? "",
          truncated: choice.finish_reason === "length",
          inputTokens: reply.usage?.prompt_tokens,
          outputTokens: reply.usage?.completion_tokens,
        }
      }
      return readStream(response, label)
    },
  }
}

/** The environment the provider reads. Only these names, so nothing else leaks in. */
export interface ModelEnvironment {
  BETTER_DESIGN_MODEL_BASE_URL?: string
  BETTER_DESIGN_MODEL_API_KEY?: string
}

/**
 * The local model the tool asked for, configured from the environment. The
 * server URL and its key come only from the environment, never from tool
 * input: an agent that could choose the URL could send a key anywhere.
 */
export function localModelProvider(model: string | undefined, env: ModelEnvironment, fetchImpl?: FetchLike): ModelProvider {
  // A key belongs to the server the user named. The Ollama default never
  // gets one, so a stray key cannot reach whatever listens on that port.
  const baseUrl = env.BETTER_DESIGN_MODEL_BASE_URL?.trim()
  return openAiCompatibleProvider({
    baseUrl: baseUrl || DEFAULT_LOCAL_BASE_URL,
    apiKey: baseUrl ? env.BETTER_DESIGN_MODEL_API_KEY?.trim() : undefined,
    model: model?.trim() || DEFAULT_LOCAL_MODEL,
    fetch: fetchImpl,
  })
}
