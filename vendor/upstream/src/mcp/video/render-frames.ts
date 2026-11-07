/**
 * render-video-frames: render chosen frames of a composition with the
 * project's own Remotion CLI, so the agent looks at its work before the full
 * render. The hosted server cannot reach the user's files, so it returns the
 * commands; the local server runs them through a RenderFrames runner and
 * returns the images. [BD-1133]
 */
import { z } from "zod";

/**
 * Composition ids Remotion accepts: letters, digits and dashes. The first
 * character is never a dash, so an id cannot read as a CLI option.
 */
const COMPOSITION_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,119}$/;
/** The entry file, relative to the project, never outside it and never an option. */
const ENTRY = /^(?![/-])(?!.*\.\.)[a-zA-Z0-9_./-]{1,200}\.(?:ts|tsx|js|jsx)$/;
/** Input props travel on the command line, once per frame, so they stay small. */
const MAX_PROPS_CHARS = 8_000;

/** The most frames one call renders. A still costs a browser page each. */
export const MAX_FRAMES = 12;

/** What render-video-frames takes. Every value reaches a command line, so each is bounded. */
export const renderFramesInputSchema = z.object({
  composition: z.string().regex(COMPOSITION_ID).describe("Composition id, as `npx remotion compositions` lists it."),
  frames: z.array(z.number().int().min(0).max(1_000_000)).min(1).max(MAX_FRAMES)
    .describe("Frame numbers to render. Pick the first, the settled and the last frame of each beat."),
  entry: z.string().regex(ENTRY).default("src/index.ts").describe("Remotion entry point, relative to the project."),
  scale: z.number().min(0.1).max(1).default(0.5).describe("Render scale. 0.5 keeps the images small enough to read back."),
  projectDir: z.string().min(1).max(1024).optional()
    .describe("Absolute path of the Remotion project. The local server renders there and returns the images."),
  props: z.record(z.string(), z.unknown())
    .refine((value) => JSON.stringify(value).length <= MAX_PROPS_CHARS, `Keep props under ${MAX_PROPS_CHARS} characters of JSON.`)
    .optional()
    .describe("Input props, as --props JSON."),
});

/** A parsed render-video-frames request. */
export type RenderFramesInput = z.infer<typeof renderFramesInputSchema>;

/** One rendered frame, as the local runner returns it. */
export interface RenderedFrame {
  frame: number;
  path: string;
  /** PNG bytes, base64. */
  data: string;
}

/** Renders frames on the user's machine. Only the stdio server has one. */
export type RenderFrames = (input: RenderFramesInput & { projectDir: string }) => Promise<RenderedFrame[]>;

/** The output path one frame renders to, relative to the project. */
export function framePath(composition: string, frame: number): string {
  return `out/frames/${composition}-${String(frame).padStart(5, "0")}.png`;
}

/** The arguments after `remotion` for one still, without the shell. Callers add how they start the CLI. */
export function stillArgs(input: RenderFramesInput, frame: number): string[] {
  const args = ["still", input.entry, input.composition, framePath(input.composition, frame), `--frame=${frame}`, `--scale=${input.scale}`, "--log=error"];
  if (input.props) args.push(`--props=${JSON.stringify(input.props)}`);
  return args;
}

const quote = (arg: string): string => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`);

/** The commands the agent runs itself when no local runner is attached. */
export function stillCommands(input: RenderFramesInput): string[] {
  return input.frames.map((frame) => ["npx", "remotion", ...stillArgs(input, frame)].map(quote).join(" "));
}

/** What to look for in each frame. Kept short: the motion guide has the full review. */
export const FRAME_CHECKLIST = [
  "Text is whole: nothing clipped, overlapping or cut by the frame edge.",
  "Colours come from the product's tokens, with no leftover demo palette.",
  "Every picture loaded: no broken-image icon and no empty box.",
  "The settled frame of each beat reads in one glance: one idea, one focal point.",
  "The last frame holds the end state, not a frame mid-move.",
  'For the full review, load get-motion-guide({ topic: "verifying-a-render" }).',
].map((line) => `- ${line}`).join("\n");
