import { z } from "zod"

import { prototypeNodeSchema } from "./figma-prototype"
import { drawnSchema } from "./figma-draw"
import { figmaKitSchema } from "./figma-kit"

/**
 * The protocol between a coding agent and the Better Design plugin running in
 * Figma. The agent cannot read a Figma file: only a plugin inside Figma can.
 * So the plugin panel holds a long poll open against a local relay, and the
 * agent's request travels down that poll and its answer back. This module is
 * the protocol and the queue, with no sockets in it, so both sides and the
 * tests agree on one shape. [BD-741]
 */

/** The port the relay listens on. One fixed port, declared in the plugin manifest. */
export const FIGMA_RELAY_PORT = 4397

/** What the agent wants: one named frame, or whatever the designer has selected. */
export const relayRequestSchema = z.object({
  id: z.string(),
  /** A frame name as it reads in Figma. Omitted means the current selection. */
  frame: z.string().optional(),
  /**
   * `model` asks for the serialized frame and its PNG instead of a rendered
   * page, so a model can rebuild a frame that holds no library component.
   * Omitted means the library path, unchanged. [BD-866]
   */
  mode: z.enum(["library", "model"]).optional(),
  /** `kit` asks for the open file's variables, styles and components instead of a frame. [BD-1056] */
  read: z.enum(["kit"]).optional(),
  /** A rebuilt page for the plugin to draw on a new page of the open file. [BD-1056] */
  draw: z.object({ name: z.string(), html: z.string(), width: z.number(), height: z.number() }).optional(),
})

/** One request, as the plugin receives it. */
export type RelayRequest = z.infer<typeof relayRequestSchema>

/** The plugin's answer: the rendered page, or why it could not render one. */
export const relayResultSchema = z.object({
  id: z.string(),
  html: z.string().optional(),
  error: z.string().optional(),
  components: z.number().optional(),
  report: z.array(z.object({ name: z.string(), reason: z.string() })).default([]),
  frame: z.string().optional(),
  /** The frames the plugin found, so a missing name can say what is there. */
  frames: z.array(z.string()).optional(),
  /** Model mode: the serialized frame, for the model to rebuild. */
  tree: prototypeNodeSchema.optional(),
  /** Model mode: the frame's PNG export, base64. */
  png: z.string().optional(),
  /** A kit read: the open file's variables, styles and components. [BD-1056] */
  kit: figmaKitSchema.optional(),
  /** A draw request: what the plugin drew. [BD-1056] */
  drawn: drawnSchema.optional(),
})

/** One answer, as the relay receives it. */
export type RelayResult = z.infer<typeof relayResultSchema>

/** The plugin announcing itself, so a request knows whether anyone is listening. */
export const relayHelloSchema = z.object({
  file: z.string(),
  /** The design system the file holds, when the plugin knows it. */
  system: z.string().optional(),
})

/** One plugin announcement. */
export type RelayHello = z.infer<typeof relayHelloSchema>

/** A queued request and the promise the agent is holding for its answer. */
export interface RelayAsk {
  id: string
  answer: Promise<RelayResult>
}

interface Waiting {
  request: RelayRequest
  settle: (result: RelayResult) => void
  expires: number
}

interface Poller {
  deliver: (request: RelayRequest | null) => void
  expires: number
}

/** How long a plugin may hold a poll open before the relay answers it empty. */
export const POLL_HOLD_MS = 25_000

/** How long an agent waits for a plugin to answer before giving up. */
export const REQUEST_TIMEOUT_MS = 300_000

/** What the relay knows about the plugin that last announced itself. */
export interface RelayConnection extends RelayHello {
  /** When the plugin last polled or announced itself, in epoch milliseconds. */
  seenAt: number
}

/**
 * The relay's state machine. `now` is injected so the tests can move time
 * without waiting, and so one clock governs every timeout.
 */
export class FigmaRelayQueue {
  private readonly waiting = new Map<string, Waiting>()
  private readonly pending: RelayRequest[] = []
  private readonly pollers: Poller[] = []
  private connection: RelayConnection | null = null
  private sequence = 0

  constructor(private readonly now: () => number = Date.now) {}

  /** The plugin that is listening, or null when none has announced itself. */
  connected(): RelayConnection | null {
    if (!this.connection) return null
    // A plugin that stopped polling is gone: Figma closed, or the file did.
    return this.now() - this.connection.seenAt > POLL_HOLD_MS * 2 ? null : this.connection
  }

  /**
   * Records the plugin's announcement, replacing any earlier one. A poll
   * carries the same announcement, so a plugin that opened before the relay
   * did is still found: there is no order to get wrong.
   */
  announce(hello: RelayHello) {
    this.connection = { ...hello, seenAt: this.now() }
  }

  /** The next request id, unique within this relay. */
  private nextId(): string {
    this.sequence += 1
    return `r${this.sequence}`
  }

  /**
   * Queues a request for the plugin and returns the promise of its answer. A
   * poll already waiting takes it at once; otherwise it waits for the next one.
   */
  ask(frame?: string, mode?: RelayRequest["mode"], read?: RelayRequest["read"], draw?: RelayRequest["draw"]): RelayAsk {
    const request: RelayRequest = { id: this.nextId(), frame, mode, read, draw }
    const answer = new Promise<RelayResult>((resolve) => {
      this.waiting.set(request.id, { request, settle: resolve, expires: this.now() + REQUEST_TIMEOUT_MS })
    })
    const poller = this.pollers.shift()
    if (poller) poller.deliver(request)
    else this.pending.push(request)
    return { id: request.id, answer }
  }

  /**
   * The plugin asking for work. Returns a promise of one request, or of null
   * when the hold elapses, which keeps the poll short enough to notice a
   * relay that went away.
   */
  poll(hello?: RelayHello): Promise<RelayRequest | null> {
    if (hello) this.announce(hello)
    else if (this.connection) this.connection.seenAt = this.now()
    const queued = this.pending.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve) => {
      this.pollers.push({ deliver: resolve, expires: this.now() + POLL_HOLD_MS })
    })
  }

  /** The plugin's answer. Unknown ids are dropped: the agent stopped waiting. */
  settle(result: RelayResult): boolean {
    const waiting = this.waiting.get(result.id)
    if (!waiting) return false
    this.waiting.delete(result.id)
    waiting.settle(result)
    return true
  }

  /**
   * Closes out whatever has run out of time: a poll is answered empty so the
   * plugin polls again, and a request is failed so the agent hears why.
   */
  sweep() {
    const now = this.now()
    for (let index = this.pollers.length - 1; index >= 0; index -= 1) {
      if (this.pollers[index].expires > now) continue
      this.pollers.splice(index, 1)[0].deliver(null)
    }
    for (const [id, waiting] of this.waiting) {
      if (waiting.expires > now) continue
      this.waiting.delete(id)
      // A request nobody ever collected is still queued, and a later poll
      // would be handed work whose agent has gone.
      const queued = this.pending.findIndex((request) => request.id === id)
      if (queued >= 0) this.pending.splice(queued, 1)
      waiting.settle({ id, error: "The plugin did not answer in time. Is it still open in the Figma file?", report: [] })
    }
  }

}

/** The message an agent gets when no plugin is listening, in the words a designer needs. */
export function noPluginMessage(): string {
  return "No Figma plugin is connected. Open the Figma file, run Plugins, Development, Better Design, and leave the panel open."
}

/** The message for a frame name the plugin could not find, naming what it did find. */
export function missingFrameMessage(frame: string, frames: string[]): string {
  if (!frames.length) return `No frame is named "${frame}", and this page holds no frames.`
  return `No frame is named "${frame}". This page holds: ${frames.slice(0, 20).join(", ")}.`
}
