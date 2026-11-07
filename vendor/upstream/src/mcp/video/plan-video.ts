/**
 * plan-video: turn a one-line brief into a film plan. It picks the archetype,
 * lays out the beats from the product-demo brief (docs/motion/product-demo-brief.md),
 * gives each beat one component from the video registry, and writes the
 * install command and a TransitionSeries skeleton the agent fills in. It reads
 * nothing but the catalog, so the same brief always gets the same plan. [BD-1133]
 */
import { z } from "zod";
import {
  VIDEO_COMPONENT_CATALOG,
  VIDEO_REGISTRY_BASE_URL,
  type VideoComponentItem,
  type VideoComponentPropDefault,
} from "../scaffold/video-components";

/** The kinds of film plan-video knows how to lay out. */
export const VIDEO_ARCHETYPES = [
  "product-demo",
  "product-launch",
  "changelog",
  "onboarding",
  "app-store-preview",
  "launch-day",
] as const;
/** One kind of film, such as a changelog or a launch-day film. */
export type VideoArchetype = (typeof VIDEO_ARCHETYPES)[number];

/** Running-time targets, from a 5-second bumper to a 60-second film. */
export const VIDEO_LENGTHS = ["bumper", "short", "standard", "long"] as const;
/** One running-time target. */
export type VideoLength = (typeof VIDEO_LENGTHS)[number];

/** Frame shapes: 16:9, 9:16 and 1:1. */
export const VIDEO_FORMATS = ["landscape", "vertical", "square"] as const;
/** One frame shape. */
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

/** What plan-video takes: the one-line brief and optional overrides. */
export const planVideoInputSchema = z.object({
  brief: z.string().trim().min(3).max(600).describe("One line: what the film is about and who it is for."),
  archetype: z.enum(VIDEO_ARCHETYPES).optional().describe("Omit to infer it from the brief."),
  length: z.enum(VIDEO_LENGTHS).optional().describe("bumper about 5s, short about 18s, standard about 40s, long 60s. Omit for the archetype's default."),
  format: z.enum(VIDEO_FORMATS).default("landscape"),
});
/** A parsed plan-video request. */
export type PlanVideoInput = z.infer<typeof planVideoInputSchema>;

/** One beat as the archetype defines it. */
interface BeatSpec {
  id: string;
  /** What the scene says, as its title reads. */
  says: string;
  /** Relative share of the running time. */
  weight: number;
  component: string;
  alternatives: string[];
  /** The transition into the next beat. */
  out?: string;
  /** The beat survives a short cut. */
  core?: boolean;
}

interface ArchetypeSpec {
  label: string;
  length: VideoLength;
  keywords: RegExp;
  beats: BeatSpec[];
}

const ARCHETYPES = {
  "product-demo": {
    label: "Product demo",
    length: "standard",
    keywords: /demo|walkthrough|how it works|show(?:case)?/i,
    beats: [
      { id: "hook", says: "The viewer's problem or the promised outcome", weight: 2, component: "title-cards", alternatives: ["headline-reveal", "type-line"], out: "transition-blur-dissolve", core: true },
      { id: "reveal", says: "The real product surface", weight: 3, component: "laptop-mockup", alternatives: ["device-drop", "button-dive"], out: "transition-zoom-through", core: true },
      { id: "feature-1", says: "First action and its result", weight: 4, component: "recording-shot", alternatives: ["cursor-path", "prompt-compose"], out: "transition-whip-pan", core: true },
      { id: "feature-2", says: "Second action and its result", weight: 4, component: "answer-reply", alternatives: ["tool-calls"], out: "transition-whip-pan" },
      { id: "proof", says: "One sourced result", weight: 2, component: "stat-count", alternatives: ["bar-rise", "line-trace"], out: "transition-blur-dissolve" },
      { id: "cta", says: "One ask and where to act", weight: 2, component: "end-card", alternatives: ["wordmark-build", "logo-reveal"], core: true },
    ],
  },
  "product-launch": {
    label: "Product launch",
    length: "standard",
    keywords: /launch(?!.*(hunt|day))|introduc|announc|unveil|new product/i,
    beats: [
      { id: "hook", says: "The problem, said in one line", weight: 2, component: "glyph-decode", alternatives: ["title-cards", "launch-title"], out: "transition-iris", core: true },
      { id: "name", says: "The product name", weight: 2, component: "wordmark-build", alternatives: ["logo-reveal", "launch-hero"], out: "transition-zoom-through", core: true },
      { id: "reveal", says: "The product on its device", weight: 3, component: "device-drop", alternatives: ["laptop-mockup", "button-dive"], out: "transition-whip-pan", core: true },
      { id: "feature-1", says: "The first thing it does", weight: 4, component: "recording-shot", alternatives: ["skeleton-build", "prompt-compose", "cursor-path"], out: "transition-whip-pan" },
      { id: "feature-2", says: "The second thing it does", weight: 3, component: "tool-calls", alternatives: ["answer-reply", "tool-calls"], out: "transition-blur-dissolve" },
      { id: "proof", says: "One sourced result", weight: 2, component: "stat-count", alternatives: ["digit-roll", "ring-meter"], out: "transition-iris" },
      { id: "cta", says: "Where to get it", weight: 2, component: "end-card", alternatives: ["wordmark-build"], core: true },
    ],
  },
  changelog: {
    label: "Changelog",
    length: "short",
    keywords: /changelog|release notes?|what'?s new|update|version|v\d/i,
    beats: [
      { id: "version", says: "The release name and number", weight: 2, component: "version-stamp", alternatives: ["headline-reveal"], out: "transition-grid-wipe", core: true },
      { id: "change-1", says: "The biggest change, shown working", weight: 4, component: "recording-shot", alternatives: ["compare-split", "cursor-path", "screenshot-capture"], out: "transition-whip-pan", core: true },
      { id: "change-2", says: "The second change", weight: 3, component: "word-mark", alternatives: ["strike-swap", "word-rotate"], out: "transition-whip-pan" },
      { id: "change-3", says: "The third change, or a fixed bug", weight: 3, component: "strike-swap", alternatives: ["type-line"], out: "transition-blur-dissolve" },
      { id: "cta", says: "Where to update", weight: 2, component: "end-card", alternatives: ["wordmark-build"], core: true },
    ],
  },
  onboarding: {
    label: "Onboarding",
    length: "standard",
    keywords: /onboard|getting started|get started|tutorial|first (run|steps)|setup|welcome/i,
    beats: [
      { id: "welcome", says: "What the viewer will be able to do", weight: 2, component: "headline-reveal", alternatives: ["type-line"], out: "transition-blur-dissolve", core: true },
      { id: "step-1", says: "Step one, the click and its result", weight: 4, component: "cursor-path", alternatives: ["recording-shot"], out: "transition-whip-pan", core: true },
      { id: "step-2", says: "Step two", weight: 4, component: "recording-shot", alternatives: ["prompt-compose", "file-attach"], out: "transition-whip-pan", core: true },
      { id: "step-3", says: "Step three", weight: 3, component: "word-rotate", alternatives: ["tool-calls"], out: "transition-blur-dissolve" },
      { id: "done", says: "The finished result and the next step", weight: 2, component: "ring-meter", alternatives: ["end-card"], core: true },
    ],
  },
  "app-store-preview": {
    label: "App Store preview",
    length: "short",
    keywords: /app store|app preview|ios app|iphone app|play store|mobile app/i,
    beats: [
      { id: "hook", says: "The app's one promise", weight: 2, component: "letter-wave", alternatives: ["title-cards"], out: "transition-iris", core: true },
      { id: "screen-1", says: "The main screen in use", weight: 4, component: "phone-mockup", alternatives: ["device-drop"], out: "transition-whip-pan", core: true },
      { id: "screen-2", says: "The second screen in use", weight: 4, component: "picker-spin", alternatives: ["phone-mockup"], out: "transition-whip-pan" },
      { id: "screen-3", says: "The moment of value", weight: 3, component: "message-bubbles", alternatives: ["phone-mockup"], out: "transition-blur-dissolve" },
      { id: "end", says: "The app name", weight: 2, component: "logo-reveal", alternatives: ["wordmark-build"], core: true },
    ],
  },
  "launch-day": {
    label: "Launch-day film",
    length: "short",
    keywords: /product hunt|launch day|hacker news|show hn|upvote|we'?re live/i,
    beats: [
      { id: "hook", says: "Today we launch", weight: 2, component: "title-cards", alternatives: ["glyph-decode"], out: "transition-iris", core: true },
      { id: "reveal", says: "What it is, on screen", weight: 3, component: "button-dive", alternatives: ["device-drop", "laptop-mockup"], out: "transition-whip-pan", core: true },
      { id: "feature", says: "The one thing it does best", weight: 4, component: "recording-shot", alternatives: ["prompt-compose", "tool-calls"], out: "transition-blur-dissolve", core: true },
      { id: "proof", says: "People already using it", weight: 3, component: "supporter-grid", alternatives: ["comment-pile", "supporter-grid"], out: "transition-iris" },
      { id: "cta", says: "Support us today, and where", weight: 2, component: "end-card", alternatives: ["wordmark-build"], core: true },
    ],
  },
} satisfies { [key in VideoArchetype]: ArchetypeSpec };

const LENGTH_SECONDS = { bumper: 5, short: 18, standard: 40, long: 60 } satisfies { [key in VideoLength]: number };
const FORMAT_SIZE = {
  landscape: [1920, 1080],
  vertical: [1080, 1920],
  square: [1080, 1080],
} satisfies { [key in VideoFormat]: [number, number] };
const FPS = 30;
const TRANSITION_FRAMES = 15;

/** Pick the archetype the brief names, or the plain product demo. */
export function inferArchetype(brief: string): VideoArchetype {
  const order: VideoArchetype[] = ["launch-day", "app-store-preview", "changelog", "onboarding", "product-launch", "product-demo"];
  return order.find((key) => ARCHETYPES[key].keywords.test(brief)) ?? "product-demo";
}

/** One beat of the plan, with its component and its frame budget. */
export interface PlannedBeat {
  id: string;
  says: string;
  component: string;
  alternatives: string[];
  durationInFrames: number;
  transitionOut?: string;
}

/** The whole plan: beats, frame size, install command and skeleton. */
export interface VideoPlan {
  archetype: VideoArchetype;
  label: string;
  length: VideoLength;
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  beats: PlannedBeat[];
  installCommand: string;
  /** A finished film template for this kind of film, when the catalog has one. */
  template?: { name: string; installCommand: string; summary: string };
  skeleton: string;
}

/** The film template that matches each kind of film. Product demos have none: their beats come from the product. */
const TEMPLATE_FOR = new Map<VideoArchetype, string>([
  ["product-launch", "film-product-launch"],
  ["changelog", "film-changelog"],
  ["onboarding", "film-onboarding"],
  ["app-store-preview", "film-app-store-preview"],
  ["launch-day", "film-launch-day"],
]);

const byName = new Map(VIDEO_COMPONENT_CATALOG.map((item) => [item.name, item]));

function item(name: string): VideoComponentItem {
  const found = byName.get(name);
  if (!found) throw new Error(`plan-video names "${name}", which is not in the video catalog.`);
  return found;
}

/** Keep the beats a length can hold: a bumper keeps the name and the ask. */
function beatsFor(spec: ArchetypeSpec, length: VideoLength): BeatSpec[] {
  if (length === "bumper") {
    const core = spec.beats.filter((beat) => beat.core);
    const first = core[0];
    const last = core.at(-1);
    return first && last && first !== last ? [first, last] : core.slice(0, 1);
  }
  if (length === "short") return spec.beats.filter((beat) => beat.core);
  return spec.beats;
}

/** Plan the film. Pure: the same input always gives the same plan. */
export function planVideo(input: PlanVideoInput): VideoPlan {
  const archetype = input.archetype ?? inferArchetype(input.brief);
  const spec = ARCHETYPES[archetype];
  const length = input.length ?? spec.length;
  const chosen = beatsFor(spec, length);
  const totalWeight = chosen.reduce((sum, beat) => sum + beat.weight, 0);
  // Transitions overlap the beats either side, so add their frames back.
  const target = LENGTH_SECONDS[length] * FPS + TRANSITION_FRAMES * (chosen.length - 1);
  const beats = chosen.map((beat, index): PlannedBeat => ({
    id: beat.id,
    says: beat.says,
    component: beat.component,
    alternatives: beat.alternatives.filter((name) => byName.has(name)),
    durationInFrames: Math.max(TRANSITION_FRAMES * 2 + 15, Math.round((target * beat.weight) / totalWeight)),
    transitionOut: index < chosen.length - 1 ? beat.out ?? "transition-blur-dissolve" : undefined,
  }));
  const [width, height] = FORMAT_SIZE[input.format];
  const names = [...new Set([...beats.map((beat) => beat.component), ...beats.flatMap((beat) => (beat.transitionOut ? [beat.transitionOut] : []))])];
  const totalFrames = beats.reduce((sum, beat) => sum + beat.durationInFrames, 0) - TRANSITION_FRAMES * (beats.length - 1);
  const plan: VideoPlan = {
    archetype,
    label: spec.label,
    length,
    format: input.format,
    width,
    height,
    fps: FPS,
    totalFrames,
    beats,
    installCommand: `npx shadcn@latest add ${names.map((name) => `${VIDEO_REGISTRY_BASE_URL}/${name}.json`).join(" ")}`,
    skeleton: "",
  };
  // A template is offered only in its own shape: a vertical film never answers a landscape plan.
  const template = byName.get(TEMPLATE_FOR.get(archetype) ?? "");
  const templateVertical = (template?.height ?? 0) > (template?.width ?? 0);
  if (template && templateVertical === (input.format === "vertical")) {
    plan.template = {
      name: template.name,
      installCommand: `npx shadcn@latest add ${VIDEO_REGISTRY_BASE_URL}/${template.name}.json`,
      summary: `about ${Math.round((template.durationInFrames ?? 0) / (template.fps ?? FPS))} seconds at ${template.width} by ${template.height}`,
    };
  }
  plan.skeleton = formatSkeleton(plan);
  return plan;
}

/** Props a component cannot render without, and the placeholder the skeleton passes. */
const REQUIRED_PROPS = new Map<string, string>([
  // The demo camera points at the component's own sample take. Lock it until
  // cut-screen-recording measures the real one.
  ["recording-shot", 'recording={"/recordings/take.mp4"} camera={[]}'],
]);

const COPY_KEY = /word|name|brand|title|label|headline|text|script|caption|line|prompt|message|answer|question|tagline|cta/i;
const TUNING_KEY = /font|style|mode|ease|fit|colou?r|ground|ink|paper|size|weight|spacing|theme|entrance|src|shadow|notch/i;

/** The prop defaults that are text, as the catalog stores them. */
const copyValue = z.union([z.string(), z.array(z.string()).min(1)]);

/** A default that is copy the agent must replace, not a tuning value, a colour or a link. */
function isCopy(key: string, value: VideoComponentPropDefault): boolean {
  if (TUNING_KEY.test(key)) return false;
  const parsed = copyValue.safeParse(value);
  if (!parsed.success) return false;
  const texts = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  return (
    texts.every((text) => /[a-zA-Z]{3,}/.test(text) && !/^(#|rgb|oklch|hsl|https?:|\/)/i.test(text)) &&
    (COPY_KEY.test(key) || texts.some((text) => /\s/.test(text)))
  );
}

/** Props for one beat: the copy props, so the agent sees what to replace, plus the theme. */
function propsLiteral(entry: VideoComponentItem): string {
  const props = Object.entries(entry.props ?? {})
    .filter(([key, value]) => isCopy(key, value))
    .map(([key, value]) => `${key}={${JSON.stringify(value)}}`);
  const required = REQUIRED_PROPS.get(entry.name);
  return [...(required ? [required] : []), ...props, "theme={theme}"].join(" ");
}

/** The Film.tsx the agent writes, with every beat on a TransitionSeries. */
export function formatSkeleton(plan: VideoPlan): string {
  const imports = new Map<string, Set<string>>();
  const add = (path: string, name: string) => imports.set(path, (imports.get(path) ?? new Set()).add(name));
  add("@remotion/transitions", "TransitionSeries");
  add("@remotion/transitions", "linearTiming");
  for (const beat of plan.beats) {
    const entry = item(beat.component);
    if (entry.importPath && entry.component) add(entry.importPath, entry.component);
    if (beat.transitionOut) {
      const cut = item(beat.transitionOut);
      if (!cut.importPath || !cut.factory) throw new Error(`${cut.name} has no presentation factory in the catalog.`);
      add(cut.importPath, cut.factory);
    }
  }
  const importLines = [...imports].map(([path, names]) => `import { ${[...names].join(", ")} } from "${path}";`);
  const body = plan.beats.flatMap((beat) => {
    const entry = item(beat.component);
    const lines = [
      `      {/* ${beat.id}: ${beat.says}. Replace the demo copy with the product's own. */}`,
      `      <TransitionSeries.Sequence durationInFrames={${beat.durationInFrames}}>`,
      `        <${entry.component} ${propsLiteral(entry)} />`,
      "      </TransitionSeries.Sequence>",
    ];
    if (beat.transitionOut) {
      lines.push(
        `      <TransitionSeries.Transition presentation={${item(beat.transitionOut).factory}()} timing={linearTiming({ durationInFrames: ${TRANSITION_FRAMES} })} />`,
      );
    }
    return lines;
  });
  return [
    ...importLines,
    'import { videoComponentTheme as theme } from "./video-component-theme";',
    "",
    `/** ${plan.label}, ${plan.format}, ${plan.totalFrames} frames at ${plan.fps} fps. Register it at ${plan.width}x${plan.height}. */`,
    `export const FILM_FRAMES = ${plan.totalFrames};`,
    "",
    "export function Film() {",
    "  return (",
    "    <TransitionSeries>",
    ...body,
    "    </TransitionSeries>",
    "  );",
    "}",
  ].join("\n");
}

/** The plan as the text the tool returns. */
export function formatVideoPlan(plan: VideoPlan): string {
  const seconds = (frames: number) => (frames / plan.fps).toFixed(1);
  return [
    `# ${plan.label} plan: ${plan.length}, ${plan.format}, ${seconds(plan.totalFrames)}s`,
    "",
    "Gather the content first: the product name and one-line value, the hook, the real product surface, and two or three actions with their results. Every number needs its source. Use a clear placeholder for anything missing and never present it as final.",
    "",
    "| Beat | What it says | Component | Instead | Seconds |",
    "| --- | --- | --- | --- | --- |",
    ...plan.beats.map((beat) => `| ${beat.id} | ${beat.says} | ${beat.component} | ${beat.alternatives.join(", ") || "none"} | ${seconds(beat.durationInFrames)} |`),
    "",
    "Read the scene titles alone: they must tell the argument without the animation. A beat that needs a very different rhythm is a new beat, not a stretched component.",
    "",
    ...(plan.template
      ? [
          "## Or start from the finished template",
          "",
          `${plan.template.name} is this kind of film already cut together, ${plan.template.summary}. Install it, replace its copy and pictures, and render; skip the skeleton below.`,
          "",
          plan.template.installCommand,
          "",
        ]
      : []),
    "## Install",
    "",
    plan.installCommand,
    "",
    "Each component's props and natural length: get-motion-guide({ component: \"<name>\" }). The starter project with the token bridge: get-motion-guide({ scaffold: true }).",
    "",
    "## src/Film.tsx",
    "",
    "```tsx",
    plan.skeleton,
    "```",
    "",
    "## Then check it",
    "",
    "1. Cut a screen recording into beats with cut-screen-recording.",
    "2. Render the first, settled and last frame of each beat with render-video-frames, and look at every one.",
    "3. Render the whole film only when the frames pass.",
  ].join("\n");
}
