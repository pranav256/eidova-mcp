/**
 * The three video tools: plan-video, cut-screen-recording and
 * render-video-frames. They sit beside get-motion-guide, which owns the
 * guidance and the component sources. [BD-1133]
 */
import { z } from "zod";
import {
  cutRecording,
  formatRecordingCode,
  recordingMeasurementsSchema,
} from "../video/recording-beats";
import { RECORDING_PROBE_FILENAME, RECORDING_PROBE_SCRIPT } from "../video/recording-probe-script";
import { formatVideoPlan, planVideo, planVideoInputSchema } from "../video/plan-video";
import {
  FRAME_CHECKLIST,
  type RenderFrames,
  renderFramesInputSchema,
  stillCommands,
} from "../video/render-frames";
import { CONTEXT_ARG, READ_ONLY_TOOL_ANNOTATIONS, type RegisterToolDeps } from "./shared";

const text = (value: string) => ({ type: "text" as const, text: value });

/** The recording's file name, on one line and short, for the answer's heading. */
const recordingName = (file: string): string =>
  (file.split(/[\\/]/).pop() ?? "the recording").replace(/[^\w .()-]/g, "").slice(0, 80) || "the recording";

function registerPlanVideo({ server, tracked }: RegisterToolDeps): void {
  server.registerTool(
    "plan-video",
    {
      title: "Plan a Video",
      description: `Plan a whole product film from a one-line brief. Returns the beats, one video component per beat with alternatives, the frame budget, one install command for every component, and a src/Film.tsx skeleton on a TransitionSeries that renders with the components' demo copy.

It infers the archetype from the brief: product demo, product launch, changelog, onboarding, App Store preview or launch-day film. Pass archetype, length (bumper, short, standard, long) or format (landscape, vertical, square) to override.

Use it before writing a Remotion composition. Then load each component with get-motion-guide({ component }) and replace the demo copy with the product's own.`,
      inputSchema: planVideoInputSchema.extend({ context: CONTEXT_ARG }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ context, ...input }) => tracked("plan-video", { context, archetype: input.archetype, length: input.length, format: input.format }, async () => {
      const plan = planVideo(input);
      return { content: [text(formatVideoPlan(plan))] };
    }),
  );
}

function registerCutScreenRecording({ server, tracked }: RegisterToolDeps): void {
  server.registerTool(
    "cut-screen-recording",
    {
      title: "Cut a Screen Recording into Beats",
      description: `Cut a screen recording of the product into beats for the recording-shot video component: the browser chrome to crop, the source second each beat opens on, its length, and where to point the camera.

Workflow:
1. Call with no measurements. It returns a Node script that measures the recording with Remotion's bundled ffprobe and ffmpeg, so nothing else needs installing.
2. Save it in the Remotion project, run it on the recording and pass its JSON output back as measurements, with the src the film loads the recording from.
3. The second call returns the crop, the beats and a <Series> of RecordingShot scenes to paste in.

The script reads the file and prints numbers. It writes nothing and sends nothing anywhere. It crops only the top chrome it can see a hard edge under; check a still before you trust it.`,
      inputSchema: z.object({
        measurements: recordingMeasurementsSchema.optional().describe("The JSON the probe script printed. Omit to get the script."),
        src: z.string().max(1024).optional().describe("How the film loads the recording, for example /recordings/take.mp4 under public/."),
        fps: z.number().int().min(1).max(120).default(30).describe("Frame rate of the film."),
        maxBeats: z.number().int().min(1).max(20).default(8),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ measurements, src, fps, maxBeats, context }) => tracked("cut-screen-recording", { context, measured: Boolean(measurements) }, async () => {
      if (!measurements) {
        return {
          content: [text([
            `Save this as ${RECORDING_PROBE_FILENAME} in the Remotion project, then run:`,
            "",
            `node ${RECORDING_PROBE_FILENAME} <recording> > recording-measurements.json`,
            "",
            "Call cut-screen-recording again with the JSON as measurements and the src the film loads the recording from.",
            "",
            "```js",
            RECORDING_PROBE_SCRIPT,
            "```",
          ].join("\n"))],
        };
      }
      const cut = cutRecording(measurements, { fps, maxBeats });
      if (cut.beats.length === 0) {
        return { content: [text("Nothing moves in this recording, so there is nothing to cut. Record the action again, or use the whole take as one locked-off shot.")] };
      }
      const margins = Object.entries(cut.stillMargins).filter(([, value]) => value > 0);
      return {
        content: [text([
          `# ${cut.beats.length} beat${cut.beats.length === 1 ? "" : "s"} from ${recordingName(measurements.file)}`,
          "",
          cut.crop.top > 0
            ? `Crop: the top ${Math.round(cut.crop.top * 100)}% is still and ends on a hard line, so it is browser chrome.`
            : "Crop: no browser chrome found at the top.",
          margins.length > 0
            ? `Still at ${margins.map(([edge, value]) => `${edge} ${Math.round(value * 100)}%`).join(", ")}: chrome or the page's own margin. Check a still and add it to crop only if it is chrome.`
            : "",
          "",
          cut.droppedBeats > 0
            ? `${cut.droppedBeats} more stretch${cut.droppedBeats === 1 ? "" : "es"} of activity came after beat ${cut.beats.length}. Raise maxBeats to cut them too.`
            : "",
          "| Beat | Source | Frames | Camera | Why it starts here |",
          "| --- | --- | --- | --- | --- |",
          ...cut.beats.map((beat) => `| ${beat.index + 1} | ${beat.sourceStart}s to ${beat.sourceEnd}s | ${beat.durationInFrames} | ${beat.zoom > 1 ? `${beat.zoom}x on (${beat.focus.x}, ${beat.focus.y})` : "locked off"} | ${beat.reason} |`),
          "",
          "Install the component: npx shadcn@latest add https://better-design.com/registry/video/recording-shot.json",
          "",
          "```tsx",
          formatRecordingCode(cut, src ?? "/recordings/take.mp4"),
          "```",
          "",
          "Then render the first and settled frame of each beat with render-video-frames and look at them.",
        ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n"))],
      };
    }),
  );
}

function registerRenderVideoFrames({ server, tracked }: RegisterToolDeps, renderFrames?: RenderFrames): void {
  server.registerTool(
    "render-video-frames",
    {
      title: "Render Video Frames",
      description: `Render chosen frames of a Remotion composition with the project's own Remotion CLI, so you look at your work before the full render. Rendering runs the project's code, so pass only a project the user owns.

${renderFrames
    ? "This server runs on the user's machine: pass projectDir and it renders each frame there and returns the images."
    : "This server cannot reach the user's files, so it returns one npx remotion still command per frame. Run them in the project and read each PNG back."}

Pick the first, the settled and the last frame of each beat. Then check every image against the returned checklist and fix what fails before rendering the film.`,
      inputSchema: renderFramesInputSchema.extend({ context: CONTEXT_ARG }),
      annotations: renderFrames
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
        : READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ context, ...input }) => tracked("render-video-frames", { context, frames: input.frames.length, local: Boolean(renderFrames && input.projectDir) }, async () => {
      if (renderFrames && input.projectDir) {
        const projectDir = input.projectDir;
        try {
          const frames = await renderFrames({ ...input, projectDir });
          return {
            content: [
              text(`Rendered ${frames.length} frame${frames.length === 1 ? "" : "s"} of ${input.composition} at scale ${input.scale}. Check each one:\n\n${FRAME_CHECKLIST}`),
              ...frames.flatMap((frame) => [
                text(`Frame ${frame.frame}: ${frame.path}`),
                { type: "image" as const, data: frame.data, mimeType: "image/png" },
              ]),
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [text(`The render failed: ${error instanceof Error ? error.message : String(error)}\n\nRun the commands yourself to see Remotion's full output:\n\n${stillCommands(input).join("\n")}`)],
          };
        }
      }
      return {
        content: [text([
          "Run these in the Remotion project, then read each PNG back and check it:",
          "",
          "```sh",
          ...stillCommands(input),
          "```",
          "",
          FRAME_CHECKLIST,
        ].join("\n"))],
      };
    }),
  );
}

/** Registers plan-video, cut-screen-recording and render-video-frames. */
export function registerVideoTools(deps: RegisterToolDeps): void {
  registerPlanVideo(deps);
  registerCutScreenRecording(deps);
  registerRenderVideoFrames(deps, deps.renderFrames);
}
