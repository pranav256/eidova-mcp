/**
 * The `store-screenshots` target of `get-design-system-kit` [BD-966]: slide
 * files styled from a design system's own tokens, and a render script the
 * user runs on their own machine. The render writes PNG files at exact store
 * sizes and refuses any file with the wrong size or a transparency layer,
 * because App Store Connect rejects images with an alpha channel.
 */

/** One store screenshot size the render script writes. */
export interface StoreScreenshotSize {
  /** Folder name under `store-screenshots/out/`. */
  id: string;
  label: string;
  width: number;
  height: number;
  /** A drawn phone around the capture, or the capture alone, which Google Play asks for. */
  frame: "phone" | "none";
}

/**
 * The sizes the target writes, from Apple's and Google's screenshot pages on
 * 29 September 2026. Apple scales the 6.9 inch set down to every smaller
 * iPhone, and Google Play promotes apps with four 9:16 phone screenshots.
 */
export const STORE_SCREENSHOT_SIZES: readonly StoreScreenshotSize[] = [
  { id: "iphone-6-9", label: "iPhone 6.9 inch", width: 1320, height: 2868, frame: "phone" },
  { id: "play-phone", label: "Google Play phone", width: 1080, height: 1920, frame: "none" },
];

/** Google Play's feature graphic, which a listing needs before it can publish. */
export const PLAY_FEATURE_GRAPHIC: StoreScreenshotSize = {
  id: "play-feature-graphic",
  label: "Google Play feature graphic",
  width: 1024,
  height: 500,
  frame: "none",
};

/** Google Play shows at most 8 screenshots per device type; fewer than 3 sells nothing. */
export const STORE_SLIDE_RANGE = { min: 3, max: 8 } as const;

/** A file the agent writes verbatim at its path in the user's project. */
export interface StoreScreenshotFile {
  path: string;
  content: string;
}

const EXAMPLE_SLIDES = {
  app: "Your app",
  slides: [
    { headline: "Say the first outcome in five words", subhead: "", capture: "captures/01.png" },
    { headline: "Show the second outcome next", subhead: "", capture: "captures/02.png" },
    { headline: "End on the reason to stay", subhead: "", capture: "captures/03.png" },
  ],
  featureGraphic: { headline: "Your app, in one line" },
};

// Every length is relative to the viewport, which the render script sets to the
// exact store size, so one page lays out every size.
const SLIDE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="theme.css">
<style>
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  body { background: var(--background); color: var(--foreground); font-family: var(--font-sans, system-ui, sans-serif);
    display: flex; flex-direction: column; align-items: center; box-sizing: border-box; padding: 7vh 8vw 0; gap: 3vh; }
  h1 { margin: 0; font-size: 7.5vw; line-height: 1.12; font-weight: 700; text-align: center; text-wrap: balance; letter-spacing: -0.02em; }
  p { margin: 0; font-size: 4vw; line-height: 1.35; text-align: center; color: var(--muted-foreground); text-wrap: balance; }
  .shot { flex: 1; min-height: 0; width: 100%; display: flex; justify-content: center; align-items: flex-start; }
  .shot img { display: block; height: 100%; max-width: 100%; object-fit: cover; object-position: top; }
  .phone { height: 104%; aspect-ratio: 9 / 19.5; box-sizing: border-box; padding: 1.6vw; border-radius: 11vw 11vw 0 0;
    background: var(--foreground); overflow: hidden; }
  .phone img { width: 100%; height: 100%; border-radius: 9.4vw 9.4vw 0 0; }
  .bare img { border-radius: calc(var(--radius, 0.75rem) * 3) calc(var(--radius, 0.75rem) * 3) 0 0; }
  body.feature { background: var(--feature-background, var(--primary)); color: var(--feature-foreground, var(--primary-foreground)); justify-content: center; align-items: flex-start; padding: 0 10vw; gap: 4vh; }
  body.feature h1 { font-size: 7vw; text-align: left; }
  body.feature .app { font-size: 3.4vw; font-weight: 600; opacity: 0.85; }
</style>
</head>
<body>
<script>
  // The render script sets window.__SLIDE__ before this page loads.
  const { kind, app, slide, frame } = window.__SLIDE__;
  const add = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return document.body.appendChild(el);
  };
  if (kind === "feature") {
    document.body.classList.add("feature");
    add("div", "app", app);
    add("h1", "", slide.headline);
  } else {
    add("h1", "", slide.headline);
    if (slide.subhead) add("p", "", slide.subhead);
    const shot = add("div", "shot " + (frame === "phone" ? "" : "bare"));
    const holder = frame === "phone" ? shot.appendChild(document.createElement("div")) : shot;
    if (frame === "phone") holder.className = "phone";
    const img = holder.appendChild(document.createElement("img"));
    img.src = slide.capture;
    img.alt = "";
  }
</script>
</body>
</html>
`;

function renderScript(): string {
  const sizes = JSON.stringify(STORE_SCREENSHOT_SIZES);
  const feature = JSON.stringify(PLAY_FEATURE_GRAPHIC);
  return `// Renders store screenshots from slides.json at the exact store sizes. [Better Design]
// Run once per change: node store-screenshots/render.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = ${sizes};
const FEATURE = ${feature};
const RANGE = ${JSON.stringify(STORE_SLIDE_RANGE)};
const deck = JSON.parse(readFileSync(join(here, "slides.json"), "utf8"));

if (deck.slides.length < RANGE.min || deck.slides.length > RANGE.max) {
  throw new Error(\`slides.json holds \${deck.slides.length} slides. Use \${RANGE.min} to \${RANGE.max}: Google Play shows at most \${RANGE.max}.\`);
}

// App Store Connect rejects a PNG with an alpha channel, so check the header, not the look.
function check(file, size) {
  const png = readFileSync(file);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), colorType = png[25];
  if (width !== size.width || height !== size.height) throw new Error(\`\${file} is \${width} x \${height}, not \${size.width} x \${size.height}.\`);
  if (colorType !== 2) throw new Error(\`\${file} has a transparency layer. Give every slide an opaque background.\`);
}

async function shoot(browser, size, data, file) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  await page.addInitScript((slide) => { window.__SLIDE__ = slide; }, data);
  await page.goto(pathToFileURL(join(here, "slide.html")).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => { throw new Error("Missing capture: " + img.src); })));
  });
  await page.screenshot({ path: file, type: "png" });
  await page.close();
  check(file, size);
}

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    mkdirSync(join(here, "out", size.id), { recursive: true });
    for (const [i, slide] of deck.slides.entries()) {
      const file = join(here, "out", size.id, String(i + 1).padStart(2, "0") + ".png");
      await shoot(browser, size, { kind: "slide", app: deck.app, slide, frame: size.frame }, file);
      console.log("wrote", file);
    }
  }
  mkdirSync(join(here, "out", FEATURE.id), { recursive: true });
  const feature = join(here, "out", FEATURE.id, "feature-graphic.png");
  await shoot(browser, FEATURE, { kind: "feature", app: deck.app, slide: deck.featureGraphic, frame: "none" }, feature);
  console.log("wrote", feature);
} finally {
  await browser.close();
}
`;
}

/**
 * The files the target returns: the system's tokens as `theme.css`, an
 * example `slides.json`, the slide page, and the render script.
 */
export function buildStoreScreenshotFiles(tokensCss: string): StoreScreenshotFile[] {
  return [
    { path: "store-screenshots/theme.css", content: tokensCss },
    { path: "store-screenshots/slides.json", content: `${JSON.stringify(EXAMPLE_SLIDES, null, 2)}\n` },
    { path: "store-screenshots/slide.html", content: SLIDE_HTML },
    { path: "store-screenshots/render.mjs", content: renderScript() },
  ];
}

/**
 * One file as a Markdown section. The fence is longer than any backtick run in
 * the file, because a generated project's tokens come from a user, and a
 * fence the content could close would let that text read as instructions.
 */
function fencedFile(file: StoreScreenshotFile): string {
  const longest = Math.max(0, ...[...file.content.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `## ${file.path}\n\n${fence}\n${file.content.replace(/\n$/, "")}\n${fence}`;
}

/** The text reply for hosts that read only text: the steps, then every file in its own safe fence. */
export function storeScreenshotText(name: string, files: StoreScreenshotFile[]): string {
  return [storeScreenshotInstructions(name), ...files.map(fencedFile)].join("\n\n");
}

/** The steps the agent follows, from captures to checked PNG files. */
export function storeScreenshotInstructions(name: string): string {
  const sizes = [...STORE_SCREENSHOT_SIZES, PLAY_FEATURE_GRAPHIC]
    .map((size) => `- ${size.label}: ${size.width} x ${size.height}, in \`store-screenshots/out/${size.id}/\``)
    .join("\n");
  return [
    `# Store screenshots in ${name}`,
    "",
    "1. Write each file in `screenshotFiles` verbatim at its path.",
    `2. Capture ${STORE_SLIDE_RANGE.min} to ${STORE_SLIDE_RANGE.max} app screens into \`store-screenshots/captures/\`. iOS Simulator: \`xcrun simctl io booted screenshot store-screenshots/captures/01.png\`. Android emulator: \`adb exec-out screencap -p > store-screenshots/captures/01.png\`.`,
    "3. Edit `slides.json`: one outcome per slide, a headline a person understands in one second, and no claims such as \"Best\", \"#1\" or \"Free\", which Google Play rejects. Check every headline with Better Design's `check-comprehension` tool before you render.",
    "4. Install Playwright once as a dev dependency with the project's package manager, then its browser: `npx playwright install chromium`.",
    "5. Google Play asks the feature graphic to avoid pure white, black and dark gray. When this system's primary color is one of those, set `--feature-background` and `--feature-foreground` to a brand color pair at the end of `theme.css`.",
    "6. Run `node store-screenshots/render.mjs`. It stops on any file with the wrong size or a transparency layer.",
    "",
    "It writes:",
    sizes,
    "",
    "Google Play screenshots carry no drawn phone, because Google asks for no device imagery. Show the user every PNG before they upload it.",
  ].join("\n");
}
