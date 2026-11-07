/**
 * Turn the measurements of a screen recording into beats for the
 * `recording-shot` video component: what to crop, where each beat starts in
 * the source, how long it runs, and where the camera points. The measurements
 * come from RECORDING_PROBE_SCRIPT, run on the user's machine. [BD-1133]
 */
import { z } from "zod";

const finite = z.number().finite();

/** The JSON the probe script prints. */
export const recordingMeasurementsSchema = z.object({
  file: z.string().max(1024),
  width: finite.positive(),
  height: finite.positive(),
  fps: finite.positive(),
  durationSeconds: finite.positive(),
  sampleFps: finite.positive(),
  sampleWidth: z.number().int().positive().max(1024),
  sampleHeight: z.number().int().positive().max(1024),
  /** Per sampled row: the share of frame pairs in which that row changed. */
  rowChange: z.array(finite.min(0).max(1)).max(1024),
  colChange: z.array(finite.min(0).max(1)).max(1024),
  /** Per sampled row: the mean contrast between it and the row below. */
  rowEdge: z.array(finite.min(0)).max(1024),
  pairs: z.array(z.object({
    t: finite.min(0),
    mean: finite.min(0),
    /** [x0, y0, x1, y1] of the changed pixels, in sample pixels. */
    box: z.array(finite).length(4).nullable(),
  })).max(20_000),
});

/** A parsed set of probe measurements. */
export type RecordingMeasurements = z.infer<typeof recordingMeasurementsSchema>;

/** Fractions of each edge to cut away, the shape `recording-shot` takes. */
export interface RecordingCrop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One beat of the cut. Frames are on the film's own clock. */
export interface RecordingBeat {
  index: number;
  /** Seconds into the source where the beat opens. */
  sourceStart: number;
  sourceEnd: number;
  /** The `startAt` prop: frames of the film's rate to skip into the source. */
  startAt: number;
  durationInFrames: number;
  /** Camera target on the film's frame, 0 to 1 from the top left. */
  focus: { x: number; y: number };
  zoom: number;
  /** Why the beat starts where it does, in plain words. */
  reason: string;
}

/** The cut: crop, framing, capture size and the beats in order. */
export interface RecordingCut {
  crop: RecordingCrop;
  /** Still bands at the other edges: chrome or the page's own margin. Check on a still. */
  stillMargins: Omit<RecordingCrop, "top">;
  /**
   * `whole` when the cropped shot is a different shape from the film, so
   * `fill` would trim its sides; `fill` when the shapes match.
   */
  framing: "fill" | "whole";
  /** Stretches of activity past maxBeats, left out of the cut. */
  droppedBeats: number;
  captureSize: { width: number; height: number };
  beats: RecordingBeat[];
}

/** How the beats fit the film they go into. */
export interface CutOptions {
  /** Frame rate of the film the beats go into. */
  fps?: number;
  /** Width over height of the film. Defaults to 16:9. */
  filmAspect?: number;
  maxBeats?: number;
}

/** A row or column counts as still when it changes in under this share of pairs. */
const STILL = 0.02;
/** Chrome sits in the outer quarter of the frame at most. */
const CHROME_REACH = 0.25;
/** Seconds of lead before the first change of a beat, and hold after its last. */
const LEAD = 0.5;
const HOLD = 0.75;
/** Stillness that splits one stretch of activity into two beats. */
const IDLE_SPLIT = 1.5;
/** How much of the frame the camera keeps around the active region. */
const FRAMING = 0.7;
const MAX_ZOOM = 2;
/** Room kept around the active region, as a share of the shot, so its context stays in frame. */
const PAD = 0.08;

const round = (value: number, places = 3): number => Number(value.toFixed(places));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Count the still band at one edge and return where its lowest strong edge
 * sits. A browser's tab strip and address bar never change during a take, and
 * a hard line closes them off from the page.
 */
function chromeDepth(change: number[], edges: number[] | undefined, reach: number): number {
  let still = 0;
  while (still < reach && (change[still] ?? 1) < STILL) still += 1;
  if (still === 0) return 0;
  if (!edges) return still;
  const band = edges.slice(0, still);
  const strongest = Math.max(0, ...band);
  if (strongest < 2) return 0;
  for (let row = band.length - 1; row >= 0; row -= 1) {
    if ((band[row] ?? 0) >= strongest * 0.6) return row + 1;
  }
  return 0;
}

/**
 * Measure the chrome to crop, as fractions of each edge.
 *
 * Only the top is cropped: a browser closes its chrome off with a hard line,
 * which the edge profile finds. A still band at another edge is as often the
 * page's own margin, so it is reported in `stillMargins` for the agent to
 * check on a still, never cut on a guess.
 */
export function measureCrop(m: RecordingMeasurements): RecordingCrop {
  const reachY = Math.floor(m.sampleHeight * CHROME_REACH);
  const top = chromeDepth(m.rowChange, m.rowEdge, reachY);
  return { top: round(top / m.sampleHeight), right: 0, bottom: 0, left: 0 };
}

/** Still bands at the other three edges, as fractions, for the agent to check. */
export function measureStillMargins(m: RecordingMeasurements): Omit<RecordingCrop, "top"> {
  const reachY = Math.floor(m.sampleHeight * CHROME_REACH);
  const reachX = Math.floor(m.sampleWidth * CHROME_REACH);
  return {
    right: round(chromeDepth([...m.colChange].reverse(), undefined, reachX) / m.sampleWidth),
    bottom: round(chromeDepth([...m.rowChange].reverse(), undefined, reachY) / m.sampleHeight),
    left: round(chromeDepth(m.colChange, undefined, reachX) / m.sampleWidth),
  };
}

interface Span {
  start: number;
  end: number;
  /** Changed-pixel boxes, each [x0, y0, x1, y1] in sample pixels. */
  boxes: number[][];
  opensOnCut: boolean;
}

/** Split the take at page changes and long still stretches. */
function activeSpans(m: RecordingMeasurements, crop: RecordingCrop): Span[] {
  const step = 1 / m.sampleFps;
  const contentArea = m.sampleWidth * (1 - crop.left - crop.right) * m.sampleHeight * (1 - crop.top - crop.bottom);
  const spans: Span[] = [];
  let current: Span | undefined;
  let lastActive = -Infinity;
  let previousWasCut = false;
  for (const pair of m.pairs) {
    if (!pair.box) {
      previousWasCut = false;
      continue;
    }
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = pair.box;
    const isCut = (x1 - x0) * (y1 - y0) >= contentArea * 0.6 && pair.mean >= 8;
    const startAt = Math.max(0, pair.t - step);
    // A scroll or a playing video changes the whole frame on every sample: only
    // the first of a run of page changes opens a beat.
    const opensBeat = isCut && !previousWasCut;
    previousWasCut = isCut;
    if (!current || opensBeat || startAt - lastActive >= IDLE_SPLIT) {
      if (current) spans.push(current);
      current = { start: startAt, end: pair.t, boxes: [], opensOnCut: isCut };
    }
    // A cut changes the whole page, so its box says nothing about where to look.
    if (!isCut) current.boxes.push(pair.box);
    current.end = pair.t;
    lastActive = pair.t;
  }
  if (current) spans.push(current);
  return spans;
}

/**
 * Map a point on the cropped shot into the film's frame. Under `whole` framing the
 * shot is letterboxed, and the camera reads its focus on the whole frame.
 */
function toFrame(point: RecordingBeat["focus"], shotAspect: number, filmAspect: number, framing: RecordingCut["framing"]): RecordingBeat["focus"] {
  if (framing === "fill") return point;
  if (shotAspect > filmAspect) {
    const share = filmAspect / shotAspect;
    return { x: point.x, y: round(0.5 - share / 2 + point.y * share) };
  }
  const share = shotAspect / filmAspect;
  return { x: round(0.5 - share / 2 + point.x * share), y: point.y };
}

/** Point the camera at the union of what moved, on the cropped shot. */
function frameBoxes(m: RecordingMeasurements, crop: RecordingCrop, boxes: Span["boxes"]): Pick<RecordingBeat, "focus" | "zoom"> {
  if (boxes.length === 0) return { focus: { x: 0.5, y: 0.5 }, zoom: 1 };
  const x0 = Math.min(...boxes.map((b) => b[0] ?? 0));
  const y0 = Math.min(...boxes.map((b) => b[1] ?? 0));
  const x1 = Math.max(...boxes.map((b) => b[2] ?? 0));
  const y1 = Math.max(...boxes.map((b) => b[3] ?? 0));
  const left = crop.left * m.sampleWidth;
  const top = crop.top * m.sampleHeight;
  const width = m.sampleWidth * (1 - crop.left - crop.right);
  const height = m.sampleHeight * (1 - crop.top - crop.bottom);
  const share = Math.max((x1 - x0) / width + PAD * 2, (y1 - y0) / height + PAD * 2);
  return {
    focus: {
      x: round(clamp(((x0 + x1) / 2 - left) / width, 0, 1)),
      y: round(clamp(((y0 + y1) / 2 - top) / height, 0, 1)),
    },
    zoom: round(clamp(FRAMING / Math.max(share, 0.01), 1, MAX_ZOOM), 2),
  };
}

/** Cut a measured recording into beats, one per stretch of activity. */
export function cutRecording(m: RecordingMeasurements, options: CutOptions = {}): RecordingCut {
  const fps = options.fps ?? 30;
  const maxBeats = options.maxBeats ?? 8;
  const filmAspect = options.filmAspect ?? 16 / 9;
  const crop = measureCrop(m);
  const shotAspect = (m.width * (1 - crop.left - crop.right)) / (m.height * (1 - crop.top - crop.bottom));
  const framing: RecordingCut["framing"] = Math.abs(shotAspect / filmAspect - 1) > 0.03 ? "whole" : "fill";
  const spans = activeSpans(m, crop);
  const beats = spans.slice(0, maxBeats).map((span, index): RecordingBeat => {
    const next = spans[index + 1];
    const sourceStart = round(Math.max(0, span.opensOnCut ? span.start : span.start - LEAD), 2);
    const limit = next ? (next.opensOnCut ? next.start : next.start - LEAD) : m.durationSeconds;
    const sourceEnd = round(Math.min(m.durationSeconds, limit, span.end + HOLD), 2);
    const framed = frameBoxes(m, crop, span.boxes);
    return {
      index,
      sourceStart,
      sourceEnd,
      // OffthreadVideo counts its trim in the film's frames, not the file's.
      startAt: Math.round(sourceStart * fps),
      durationInFrames: Math.max(1, Math.round((sourceEnd - sourceStart) * fps)),
      focus: toFrame(framed.focus, shotAspect, filmAspect, framing),
      zoom: framed.zoom,
      reason: span.opensOnCut ? "The page changes here." : "Something on the page starts to move here.",
    };
  });
  return {
    crop,
    stillMargins: measureStillMargins(m),
    framing,
    captureSize: { width: m.width, height: m.height },
    beats,
    droppedBeats: Math.max(0, spans.length - maxBeats),
  };
}

/** The Remotion code for the cut: one Series.Sequence per beat. */
export function formatRecordingCode(cut: RecordingCut, src: string): string {
  const { top, right, bottom, left } = cut.crop;
  const keep = `{ x: ${round(left)}, y: ${round(top)}, width: ${round(1 - left - right)}, height: ${round(1 - top - bottom)} }`;
  const size = `{ width: ${cut.captureSize.width}, height: ${cut.captureSize.height} }`;
  const sequences = cut.beats.map((beat) => {
    const push = Math.min(24, Math.max(8, Math.round(beat.durationInFrames / 4)));
    const camera = beat.zoom > 1
      ? `[{ from: 6, frames: ${push}, scale: ${beat.zoom}, focus: [${beat.focus.x}, ${beat.focus.y}] }]`
      : "[]";
    return [
      `      {/* Beat ${beat.index + 1}: ${beat.sourceStart}s to ${beat.sourceEnd}s of the take. ${beat.reason} */}`,
      `      <Series.Sequence durationInFrames={${beat.durationInFrames}}>`,
      `        <RecordingShot recording={src} captureSize={${size}} keep={${keep}} framing="${cut.framing}" startAt={${beat.startAt}} camera={${camera}} fadeIn={false} theme={theme} />`,
      "      </Series.Sequence>",
    ].join("\n");
  });
  return [
    'import { Series } from "remotion";',
    'import { RecordingShot } from "@/components/bd-video/recording-shot";',
    'import { videoComponentTheme as theme } from "./video-component-theme";',
    "",
    `const src = ${JSON.stringify(src)};`,
    "",
    "/** The recording, cut into beats by cut-screen-recording. */",
    "export function RecordingBeats() {",
    "  return (",
    "    <Series>",
    ...sequences,
    "    </Series>",
    "  );",
    "}",
  ].join("\n");
}
