/**
 * The script cut-screen-recording hands the agent on its first call. It runs in
 * the user's Remotion project, reads the recording through Remotion's bundled
 * ffprobe and ffmpeg, and prints the measurements the second call turns into
 * beats. It is plain Node with no dependencies, because the agent writes it to
 * a file and runs it as it is. [BD-1133]
 *
 * Remotion's ffmpeg is a small build: it has no fps or select filter and no
 * rawvideo muxer, so the script samples with -r and decodes a stream of
 * greyscale PNG frames itself.
 */
export const RECORDING_PROBE_SCRIPT = String.raw`// Measure a screen recording for cut-screen-recording. Usage:
//   node probe-recording.mjs <recording> > measurements.json
// Run it inside a Remotion project: it uses "npx remotion ffprobe" and
// "npx remotion ffmpeg", or FFMPEG and FFPROBE when they are set. It reads the
// file and prints numbers. It writes nothing and sends nothing anywhere.
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node probe-recording.mjs <recording>");
  process.exit(1);
}
const SAMPLE_FPS = 4;
const SAMPLE_W = 160;
const CHANGE = 18; // grey levels that count as a changed pixel

const tool = (name) => {
  const env = process.env[name.toUpperCase()];
  return env ? [env, []] : ["npx", ["remotion", name]];
};
const run = (name, args, opts = {}) => {
  const [cmd, pre] = tool(name);
  return execFileSync(cmd, [...pre, ...args], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"], ...opts });
};

const info = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file]).toString());
const stream = info.streams[0];
const [num, den] = String(stream.r_frame_rate).split("/").map(Number);
const width = stream.width;
const height = stream.height;
const sampleH = Math.max(2, Math.round((SAMPLE_W * height) / width / 2) * 2);

const png = run("ffmpeg", ["-v", "error", "-i", file, "-vf", "scale=" + SAMPLE_W + ":" + sampleH + ",format=gray", "-r", String(SAMPLE_FPS), "-f", "image2pipe", "-c:v", "png", "-"]);

/** Split the piped PNG stream and decode each 8-bit greyscale image to raw rows. */
function decodeFrames(buf) {
  const frames = [];
  let at = 0;
  while (at + 8 <= buf.length) {
    at += 8; // signature
    let w = 0;
    let h = 0;
    const idat = [];
    for (;;) {
      const len = buf.readUInt32BE(at);
      const type = buf.toString("ascii", at + 4, at + 8);
      const data = buf.subarray(at + 8, at + 8 + len);
      at += 12 + len;
      if (type === "IHDR") {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
        if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) throw new Error("Expected 8-bit greyscale, non-interlaced PNG frames");
      } else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const filter = raw[y * (w + 1)];
      for (let x = 0; x < w; x++) {
        const v = raw[y * (w + 1) + 1 + x];
        const a = x > 0 ? out[y * w + x - 1] : 0;
        const b = y > 0 ? out[(y - 1) * w + x] : 0;
        const c = x > 0 && y > 0 ? out[(y - 1) * w + x - 1] : 0;
        let p = 0;
        if (filter === 1) p = a;
        else if (filter === 2) p = b;
        else if (filter === 3) p = (a + b) >> 1;
        else if (filter === 4) {
          const e = a + b - c;
          const pa = Math.abs(e - a);
          const pb = Math.abs(e - b);
          const pc = Math.abs(e - c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        out[y * w + x] = (v + p) & 255;
      }
    }
    frames.push({ w, h, px: out });
  }
  return frames;
}

const frames = decodeFrames(png);
const w = frames[0].w;
const h = frames[0].h;
const rowChange = new Array(h).fill(0);
const colChange = new Array(w).fill(0);
const rowEdge = new Array(h - 1).fill(0);
const pairs = [];

for (const f of frames) {
  for (let y = 0; y < h - 1; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += Math.abs(f.px[y * w + x] - f.px[(y + 1) * w + x]);
    rowEdge[y] += sum / w / frames.length;
  }
}
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1].px;
  const b = frames[i].px;
  let total = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  const rows = new Array(h).fill(false);
  const cols = new Array(w).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(a[y * w + x] - b[y * w + x]);
      total += d;
      if (d >= CHANGE) {
        rows[y] = true;
        cols[x] = true;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  rows.forEach((r, y) => { if (r) rowChange[y] += 1; });
  cols.forEach((c, x) => { if (c) colChange[x] += 1; });
  pairs.push({
    t: Number((i / SAMPLE_FPS).toFixed(3)),
    mean: Number((total / (w * h)).toFixed(3)),
    box: x1 >= 0 ? [x0, y0, x1 + 1, y1 + 1] : null,
  });
}

const n = Math.max(1, frames.length - 1);
const round = (v) => Number(v.toFixed(4));
process.stdout.write(JSON.stringify({
  file,
  width,
  height,
  fps: den ? num / den : num,
  durationSeconds: Number(info.format.duration),
  sampleFps: SAMPLE_FPS,
  sampleWidth: w,
  sampleHeight: h,
  rowChange: rowChange.map((c) => round(c / n)),
  colChange: colChange.map((c) => round(c / n)),
  rowEdge: rowEdge.map(round),
  pairs,
}) + "\n");
`;

/** Where the agent saves the script, relative to the Remotion project. */
export const RECORDING_PROBE_FILENAME = "scripts/probe-recording.mjs";
