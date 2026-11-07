/** A brand-aware Remotion starter returned by get-motion-guide. */

export type ScaffoldFile = {
  path: string;
  contents: string;
};

export const MOTION_SCAFFOLD_FILES: ScaffoldFile[] = [
  {
    path: "package.json",
    contents: `{
  "name": "product-demo-video",
  "private": true,
  "scripts": {
    "dev": "remotion studio --no-open",
    "check": "tsc --noEmit && remotion compositions src/index.ts",
    "music": "bun scripts/make-music.ts",
    "captions": "bun scripts/write-captions.ts",
    "render": "remotion render ProductDemo-Landscape out/product-demo.mp4 --concurrency=6",
    "render:vertical": "remotion render ProductDemo-Vertical out/product-demo-vertical.mp4 --concurrency=6",
    "package": "bun scripts/package-output.ts",
    "review:frames": "mkdir -p out/frames && ffmpeg -i out/product-demo.mp4 -vf fps=3 out/frames/%04d.png"
  },
  "dependencies": {
    "@remotion/cli": "4.0.513",
    "@remotion/media": "4.0.513",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "remotion": "4.0.513",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "22.13.14",
    "@types/react": "19.0.0",
    "typescript": "5.7.3"
  }
}
`,
  },
  {
    path: "tsconfig.json",
    contents: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "baseUrl": ".",
    "paths": {"@/*": ["./src/*"]}
  },
  "include": ["src", "scripts"]
}
`,
  },
  {
    path: "remotion.config.ts",
    contents: `import path from "node:path";
import {Config} from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// The video components import "@/components/bd-video/..." and "@/lib/bd-video".
// Remotion's bundler does not read tsconfig paths, so the alias lives here too.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {...config.resolve?.alias, "@": path.join(process.cwd(), "src")},
  },
}));
`,
  },
  {
    path: ".gitignore",
    contents: `node_modules/
out/
public/music/
public/captions/
`,
  },
  {
    path: "components.json",
    contents: `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
`,
  },
  {
    path: "src/index.css",
    contents: `/* The shadcn CLI reads this path from components.json. The video components paint from JS tokens, not CSS. */
`,
  },
  {
    path: "src/video-component-theme.ts",
    contents: `import {videoDesignSystem as system} from "./design-system";

/**
 * The token set the Better Design video components read through their
 * \`theme\` prop. Same shape as VideoTheme in @/lib/bd-video, declared here so
 * the project typechecks before the first component is installed.
 */
export type VideoComponentTheme = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Corner radius in px. */
  radius: number;
  /** A CSS font family the project has loaded. */
  fontFamily?: string;
};

/** The video design system has no destructive role; this is the one value the film adds. */
const DESTRUCTIVE = "oklch(0.58 0.22 27)";

/**
 * Pass this to every video component: <AnswerReply theme={videoComponentTheme} />.
 * The components read any CSS color, oklch() included, and mix in OKLab.
 */
export const videoComponentTheme: VideoComponentTheme = {
  background: system.color.stage,
  foreground: system.color.foreground,
  card: system.color.surface,
  cardForeground: system.color.foreground,
  popover: system.color.surface,
  popoverForeground: system.color.foreground,
  primary: system.color.accent,
  primaryForeground: system.color.accentForeground,
  secondary: system.color.elevatedSurface,
  secondaryForeground: system.color.foreground,
  muted: system.color.elevatedSurface,
  mutedForeground: system.color.mutedForeground,
  accent: system.color.elevatedSurface,
  accentForeground: system.color.foreground,
  destructive: DESTRUCTIVE,
  destructiveForeground: system.color.accentForeground,
  border: system.color.border,
  input: system.color.border,
  ring: system.color.accent,
  radius: system.frame.radius.small,
};
`,
  },
  {
    path: "src/index.ts",
    contents: `import {registerRoot} from "remotion";
import {RemotionRoot} from "./Root";

registerRoot(RemotionRoot);
`,
  },
  {
    path: "src/design-system.ts",
    contents: `export type VideoFormat = "landscape" | "vertical";
export type MotionTemperament = "calm" | "direct" | "expressive" | "technical";

export type VideoDesignSystem = {
  color: {
    stage: string;
    foreground: string;
    mutedForeground: string;
    surface: string;
    elevatedSurface: string;
    border: string;
    accent: string;
    accentForeground: string;
  };
  type: {
    family: string;
    displayWeight: number;
    bodyWeight: number;
  };
  frame: {
    radius: {small: number; medium: number; large: number};
    shadow: string;
  };
  motion: {
    temperament: MotionTemperament;
    duration: {fast: number; normal: number; slow: number};
    stagger: {tight: number; normal: number};
    spring: {settle: number; emphasis: number};
    distance: {short: number; medium: number};
  };
  camera: {
    subtlePushFrom: number;
    normalPushFrom: number;
    perspective: number;
  };
  transition: {
    neutral: "cut";
    depthFrames: number;
    emphasisFrames: number;
  };
  format: Record<VideoFormat, {
    width: number;
    height: number;
    safeX: number;
    safeY: number;
  }>;
  audio: {bpm: number; beatFrames: number};
};

/**
 * Replace these semantic values with the product's design-system tokens.
 * Keep the roles intact: the film and the app should use the same brand logic.
 */
export const videoDesignSystem: VideoDesignSystem = {
  color: {
    stage: "oklch(0.98 0.004 90)",
    foreground: "oklch(0.24 0.005 75)",
    mutedForeground: "oklch(0.52 0.008 80)",
    surface: "oklch(1 0 0)",
    elevatedSurface: "oklch(0.99 0.004 90)",
    border: "oklch(0.9 0.008 85)",
    accent: "oklch(0.62 0.2 256)",
    accentForeground: "oklch(1 0 0)",
  },
  type: {
    family: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
    displayWeight: 650,
    bodyWeight: 500,
  },
  frame: {
    radius: {small: 10, medium: 18, large: 30},
    shadow: "0 24px 70px oklch(0 0 0 / 0.12), 0 3px 12px oklch(0 0 0 / 0.08)",
  },
  motion: {
    temperament: "direct",
    duration: {fast: 12, normal: 24, slow: 36},
    stagger: {tight: 4, normal: 8},
    spring: {settle: 200, emphasis: 26},
    distance: {short: 18, medium: 48},
  },
  camera: {
    subtlePushFrom: 0.96,
    normalPushFrom: 0.92,
    perspective: 1200,
  },
  transition: {
    neutral: "cut",
    depthFrames: 18,
    emphasisFrames: 12,
  },
  format: {
    landscape: {width: 1920, height: 1080, safeX: 120, safeY: 100},
    vertical: {width: 1080, height: 1920, safeX: 84, safeY: 180},
  },
  audio: {bpm: 120, beatFrames: 15},
};
`,
  },
  {
    path: "src/formats.ts",
    contents: `import {videoDesignSystem, type VideoFormat} from "./design-system";

export const FORMAT_PROFILES = videoDesignSystem.format;

export const formatProfile = (format: VideoFormat) => FORMAT_PROFILES[format];

export const scaleFromReference = (value: number, width: number, height: number) =>
  value * (Math.min(width, height) / 1080);

export const isVerticalFormat = (width: number, height: number) => height > width;
`,
  },
  {
    path: "src/brief.ts",
    contents: `import {z} from "zod";

export const ProductDemoSchema = z.object({
  format: z.enum(["landscape", "vertical"]),
  duration: z.enum(["short", "standard"]),
  product: z.object({
    name: z.string(),
    oneLiner: z.string(),
  }),
  hook: z.string(),
  productMoment: z.object({
    action: z.string(),
    result: z.string(),
  }),
  features: z.array(z.object({
    title: z.string(),
    outcome: z.string(),
  })).min(2).max(3),
  proof: z.object({
    label: z.string(),
    value: z.string(),
    sourceUrl: z.string().url(),
  }).optional(),
  cta: z.object({
    line: z.string(),
    destination: z.string(),
  }),
  music: z.boolean(),
  reducedMotion: z.boolean(),
});

export type ProductDemoProps = z.infer<typeof ProductDemoSchema>;

export const DEFAULT_BRIEF: ProductDemoProps = {
  format: "landscape",
  duration: "standard",
  product: {
    name: "Your product",
    oneLiner: "A clear description of what it helps people do",
  },
  hook: "The costly problem your customer recognizes",
  productMoment: {
    action: "Show one real action in the product",
    result: "Show the useful result of that action",
  },
  features: [
    {title: "First concrete moment", outcome: "The result people get"},
    {title: "Second concrete moment", outcome: "The next useful result"},
  ],
  proof: {
    label: "A sourced result",
    value: "Replace me",
    sourceUrl: "https://example.com/source",
  },
  cta: {
    line: "Try the product",
    destination: "example.com",
  },
  music: false,
  reducedMotion: false,
};
`,
  },
  {
    path: "src/timeline.ts",
    contents: `import type {ProductDemoProps} from "./brief";

export type SceneKind = "hook" | "positioning" | "product" | "feature" | "proof" | "cta";

export type SceneSpec = {
  id: string;
  kind: SceneKind;
  title: string;
  supporting?: string;
  sourceUrl?: string;
  durationInFrames: number;
};

export type TimelineScene = SceneSpec & {from: number};

const withOffsets = (scenes: SceneSpec[]): TimelineScene[] => {
  let from = 0;
  return scenes.map((scene) => {
    const result = {...scene, from};
    from += scene.durationInFrames;
    return result;
  });
};

const proofScenes = (props: ProductDemoProps, durationInFrames: number): SceneSpec[] => props.proof
  ? [{
    id: "proof",
    kind: "proof",
    title: props.proof.value,
    supporting: props.proof.label,
    sourceUrl: props.proof.sourceUrl,
    durationInFrames,
  }]
  : [];

export const buildTimeline = (props: ProductDemoProps): TimelineScene[] => {
  if (props.duration === "short") {
    return withOffsets([
      {id: "hook", kind: "hook", title: props.hook, durationInFrames: 90},
      {
        id: "product",
        kind: "product",
        title: props.productMoment.action,
        supporting: props.productMoment.result,
        durationInFrames: 270,
      },
      ...proofScenes(props, 120),
      {id: "cta", kind: "cta", title: props.cta.line, supporting: props.cta.destination, durationInFrames: 60},
    ]);
  }

  const featureBudget = 420;
  const featureLength = Math.floor(featureBudget / props.features.length);
  const featureScenes = props.features.map((feature, index) => ({
    id: "feature-" + (index + 1),
    kind: "feature" as const,
    title: feature.title,
    supporting: feature.outcome,
    durationInFrames: index === props.features.length - 1
      ? featureBudget - featureLength * index
      : featureLength,
  }));

  return withOffsets([
    {id: "hook", kind: "hook", title: props.hook, durationInFrames: 120},
    {id: "positioning", kind: "positioning", title: props.product.oneLiner, supporting: props.product.name, durationInFrames: 90},
    {
      id: "product",
      kind: "product",
      title: props.productMoment.action,
      supporting: props.productMoment.result,
      durationInFrames: 300,
    },
    ...featureScenes,
    ...proofScenes(props, 270),
    {id: "cta", kind: "cta", title: props.cta.line, supporting: props.cta.destination, durationInFrames: 150},
  ]);
};

export const totalFrames = (props: ProductDemoProps) =>
  buildTimeline(props).reduce((total, scene) => total + scene.durationInFrames, 0);

export const captionCues = (props: ProductDemoProps) =>
  buildTimeline(props).map((scene) => ({
    startFrame: scene.from,
    endFrame: scene.from + scene.durationInFrames,
    text: [scene.title, scene.supporting].filter(Boolean).join(". "),
  }));
`,
  },
  {
    path: "src/Root.tsx",
    contents: `import React from "react";
import {Composition, type CalculateMetadataFunction} from "remotion";
import {DEFAULT_BRIEF, ProductDemoSchema, type ProductDemoProps} from "./brief";
import {formatProfile} from "./formats";
import {totalFrames} from "./timeline";
import {ProductDemo} from "./Video";

const calculateMetadata: CalculateMetadataFunction<ProductDemoProps> = ({props}) => {
  const profile = formatProfile(props.format);
  return {
    width: profile.width,
    height: profile.height,
    durationInFrames: totalFrames(props),
    props,
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="ProductDemo-Landscape"
      component={ProductDemo}
      schema={ProductDemoSchema}
      defaultProps={{...DEFAULT_BRIEF, format: "landscape"}}
      calculateMetadata={calculateMetadata}
      durationInFrames={1350}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ProductDemo-Vertical"
      component={ProductDemo}
      schema={ProductDemoSchema}
      defaultProps={{...DEFAULT_BRIEF, format: "vertical"}}
      calculateMetadata={calculateMetadata}
      durationInFrames={1350}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
`,
  },
  {
    path: "src/Video.tsx",
    contents: `import React from "react";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {ProductDemoProps} from "./brief";
import {videoDesignSystem as system} from "./design-system";
import {formatProfile, isVerticalFormat, scaleFromReference} from "./formats";
import {buildTimeline, type TimelineScene} from "./timeline";

const enter = (frame: number, fps: number, reducedMotion: boolean) => reducedMotion
  ? 1
  : spring({
    frame,
    fps,
    config: {damping: system.motion.spring.settle},
  });

const SceneFrame: React.FC<React.PropsWithChildren> = ({children}) => {
  const {width, height} = useVideoConfig();
  const vertical = isVerticalFormat(width, height);
  const profile = formatProfile(vertical ? "vertical" : "landscape");
  return (
    <AbsoluteFill style={{
      padding: profile.safeY + "px " + profile.safeX + "px",
      backgroundColor: system.color.stage,
      color: system.color.foreground,
      fontFamily: system.type.family,
      overflow: "hidden",
    }}>
      {children}
    </AbsoluteFill>
  );
};

type SceneProps = {scene: TimelineScene; reducedMotion: boolean};

const MessageScene: React.FC<SceneProps & {accent?: boolean}> = ({scene, reducedMotion, accent = false}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const vertical = isVerticalFormat(width, height);
  const progress = enter(frame, fps, reducedMotion);
  const titleSize = scaleFromReference(vertical ? 92 : 84, width, height);
  return (
    <SceneFrame>
      <div style={{
        margin: "auto",
        width: "100%",
        maxWidth: vertical ? 850 : 1500,
        textAlign: "center",
        translate: reducedMotion ? "none" : "0 " + interpolate(progress, [0, 1], [system.motion.distance.short, 0]) + "px",
      }}>
        <h1 style={{
          margin: 0,
          fontSize: titleSize,
          lineHeight: 1.02,
          letterSpacing: "-0.045em",
          fontWeight: system.type.displayWeight,
          textWrap: "balance",
          color: accent ? system.color.accent : system.color.foreground,
        }}>
          {scene.title}
        </h1>
        {scene.supporting ? (
          <p style={{
            margin: vertical ? "38px 0 0" : "30px 0 0",
            fontSize: scaleFromReference(34, width, height),
            lineHeight: 1.25,
            color: system.color.mutedForeground,
          }}>
            {scene.supporting}
          </p>
        ) : null}
      </div>
    </SceneFrame>
  );
};

const ProductScene: React.FC<SceneProps> = ({scene, reducedMotion}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const vertical = isVerticalFormat(width, height);
  const profile = formatProfile(vertical ? "vertical" : "landscape");
  const progress = enter(frame, fps, reducedMotion);
  const clickFrame = Math.min(96, Math.floor(scene.durationInFrames * 0.42));
  const resultOpacity = reducedMotion ? 1 : interpolate(frame, [clickFrame + system.motion.duration.fast, clickFrame + system.motion.duration.normal], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const panelWidth = vertical ? width - profile.safeX * 2 : Math.min(width - profile.safeX * 2, 1320);
  const panelHeight = vertical ? Math.min(980, height * 0.52) : Math.min(680, height - 260);
  return (
    <SceneFrame>
      <div style={{display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: vertical ? 54 : 34}}>
        <p style={{margin: 0, fontSize: scaleFromReference(32, width, height), fontWeight: 600, textAlign: "center"}}>{scene.title}</p>
        <div style={{
          position: "relative",
          width: panelWidth,
          height: panelHeight,
          borderRadius: system.frame.radius.large,
          border: "1px solid " + system.color.border,
          backgroundColor: system.color.surface,
          boxShadow: system.frame.shadow,
          overflow: "hidden",
          scale: reducedMotion ? 1 : interpolate(progress, [0, 1], [system.camera.subtlePushFrom, 1], {output: "perceptual-scale"}),
        }}>
          <div style={{height: 62, borderBottom: "1px solid " + system.color.border, display: "flex", alignItems: "center", gap: 12, padding: "0 24px"}}>
            {[0, 1, 2].map((dot) => <span key={dot} style={{width: 12, height: 12, borderRadius: 999, backgroundColor: system.color.border}} />)}
          </div>
          <div style={{padding: vertical ? 42 : 54, display: "grid", gap: 24}}>
            <div style={{height: 18, width: "38%", borderRadius: 999, backgroundColor: system.color.border}} />
            <div style={{height: 110, borderRadius: system.frame.radius.medium, border: "1px solid " + system.color.border, padding: 28, display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <span style={{fontSize: scaleFromReference(28, width, height), fontWeight: 600}}>{scene.title}</span>
              <span style={{position: "relative", padding: "14px 22px", borderRadius: system.frame.radius.small, backgroundColor: system.color.accent, color: system.color.accentForeground, fontSize: scaleFromReference(22, width, height), fontWeight: 650}}>
                Run
                <span style={{
                  position: "absolute",
                  display: reducedMotion ? "none" : "block",
                  left: "50%",
                  top: "50%",
                  zIndex: 2,
                  width: 28,
                  height: 38,
                  backgroundColor: system.color.foreground,
                  clipPath: "polygon(0 0, 100% 70%, 58% 72%, 45% 100%)",
                  translate: interpolate(frame, [12, clickFrame], ["-220px 160px", "4px 6px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1)}),
                  scale: interpolate(frame, [clickFrame, clickFrame + 6, clickFrame + 12], [1, 0.82, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", output: "perceptual-scale"}),
                }} />
              </span>
            </div>
            <div style={{opacity: resultOpacity, borderRadius: system.frame.radius.medium, padding: 28, backgroundColor: system.color.elevatedSurface, border: "1px solid " + system.color.accent, fontSize: scaleFromReference(27, width, height)}}>
              {scene.supporting}
            </div>
          </div>
        </div>
      </div>
    </SceneFrame>
  );
};

const ProofScene: React.FC<SceneProps> = ({scene, reducedMotion}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const vertical = isVerticalFormat(width, height);
  const profile = formatProfile(vertical ? "vertical" : "landscape");
  const progress = enter(frame, fps, reducedMotion);
  return (
    <SceneFrame>
      <div style={{margin: "auto", textAlign: "center", scale: reducedMotion ? 1 : interpolate(progress, [0, 1], [0.92, 1], {output: "perceptual-scale"})}}>
        <div style={{fontSize: scaleFromReference(150, width, height), lineHeight: 1, letterSpacing: "-0.06em", fontWeight: 700, color: system.color.accent}}>{scene.title}</div>
        <p style={{fontSize: scaleFromReference(36, width, height), color: system.color.foreground}}>{scene.supporting}</p>
      </div>
      <div style={{position: "absolute", left: 0, right: 0, bottom: profile.safeY, textAlign: "center", fontSize: scaleFromReference(18, width, height), color: system.color.mutedForeground}}>
        Source: {scene.sourceUrl}
      </div>
    </SceneFrame>
  );
};

const SceneRenderer: React.FC<SceneProps> = ({scene, reducedMotion}) => {
  if (scene.kind === "product") return <ProductScene scene={scene} reducedMotion={reducedMotion} />;
  if (scene.kind === "proof") return <ProofScene scene={scene} reducedMotion={reducedMotion} />;
  return <MessageScene scene={scene} reducedMotion={reducedMotion} accent={scene.kind === "cta"} />;
};

export const ProductDemo: React.FC<ProductDemoProps> = (props) => {
  const timeline = buildTimeline(props);
  return (
    <AbsoluteFill style={{backgroundColor: system.color.stage}}>
      {props.music ? <Audio src={staticFile("music/bed.wav")} /> : null}
      <Series>
        {timeline.map((scene) => (
          <Series.Sequence key={scene.id} name={scene.id} durationInFrames={scene.durationInFrames}>
            <SceneRenderer scene={scene} reducedMotion={props.reducedMotion} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
`,
  },
  {
    path: "scripts/write-captions.ts",
    contents: `import {mkdir, writeFile} from "node:fs/promises";
import {DEFAULT_BRIEF} from "../src/brief";
import {captionCues} from "../src/timeline";

const fps = 30;
const stamp = (frame: number) => {
  const milliseconds = Math.round((frame / fps) * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const rest = milliseconds % 1000;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":") + "." + String(rest).padStart(3, "0");
};

const body = captionCues(DEFAULT_BRIEF).map((cue, index) => [
  String(index + 1),
  stamp(cue.startFrame) + " --> " + stamp(cue.endFrame),
  cue.text,
].join("\\n")).join("\\n\\n");

await mkdir("public/captions", {recursive: true});
await writeFile("public/captions/product-demo.vtt", "WEBVTT\\n\\n" + body + "\\n");
console.log("Wrote public/captions/product-demo.vtt");
`,
  },
  {
    path: "scripts/make-music.ts",
    contents: `import {mkdir, writeFile} from "node:fs/promises";
import {DEFAULT_BRIEF} from "../src/brief";
import {videoDesignSystem} from "../src/design-system";
import {buildTimeline, totalFrames} from "../src/timeline";

const sampleRate = 44_100;
const fps = 30;
const beatSeconds = 60 / videoDesignSystem.audio.bpm;
const notes = [220, 261.63, 329.63, 392];
const timeline = buildTimeline(DEFAULT_BRIEF);
const cutSeconds = timeline.slice(1).map((scene) => scene.from / fps);
const sampleCount = Math.floor(sampleRate * totalFrames(DEFAULT_BRIEF) / fps);
const samples = new Float32Array(sampleCount);

for (let index = 0; index < sampleCount; index++) {
  const time = index / sampleRate;
  let value = notes.reduce(
    (sum, note, position) => sum + Math.sin(2 * Math.PI * note * time) * (0.04 / (position + 1)),
    0,
  );
  const beatPosition = time % beatSeconds;
  const beatIndex = Math.floor(time / beatSeconds);
  if (beatPosition < 0.16) {
    const envelope = (1 - beatPosition / 0.16) * (beatIndex % 4 === 0 ? 1 : 0.45);
    value += Math.sin(2 * Math.PI * notes[beatIndex % notes.length] * 2 * time) * envelope * 0.1;
  }
  for (const cut of cutSeconds) {
    const distance = time - (cut - 0.5);
    if (distance >= 0 && distance <= 0.5) {
      value += Math.sin(2 * Math.PI * 110 * time) * (distance / 0.5) * 0.1;
    }
  }
  samples[index] = value;
}

const peak = samples.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0) || 1;
const gain = 0.89 / peak;
const bytesPerSample = 2;
const dataBytes = sampleCount * bytesPerSample;
const wav = Buffer.alloc(44 + dataBytes);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
wav.writeUInt16LE(bytesPerSample, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataBytes, 40);

for (let index = 0; index < sampleCount; index++) {
  const normalized = Math.max(-1, Math.min(1, samples[index] * gain));
  wav.writeInt16LE(Math.round(normalized * 32_767), 44 + index * bytesPerSample);
}

await mkdir("public/music", {recursive: true});
await writeFile("public/music/bed.wav", wav);
console.log("Wrote public/music/bed.wav");
`,
  },
  {
    path: "scripts/package-output.ts",
    contents: `import {copyFile, mkdir} from "node:fs/promises";

const artifacts = [
  ["out/product-demo.mp4", "out/delivery/product-demo.mp4"],
  ["out/product-demo-vertical.mp4", "out/delivery/product-demo-vertical.mp4"],
  ["public/captions/product-demo.vtt", "out/delivery/product-demo.vtt"],
] as const;

await mkdir("out/delivery", {recursive: true});
for (const [source, destination] of artifacts) {
  await copyFile(source, destination);
}

console.log("Packaged both videos and the required VTT caption track in out/delivery");
`,
  },
  {
    path: "README.md",
    contents: `# Product demo video

This starter turns a product brief and an existing design system into an editable Remotion video. The product interaction is the visual proof.

## Start here

1. Install the official Remotion skills from https://www.remotion.dev/docs/ai/skills.
2. Replace the semantic tokens in src/design-system.ts with the product's tokens.
3. Replace every value in DEFAULT_BRIEF in src/brief.ts. The supplied values are explicit placeholders, not final copy or proof.
4. Run bun install, bun run check and bun run dev. Open the exact Studio URL printed by the command.
5. Check both ProductDemo-Landscape and ProductDemo-Vertical. Turn on reducedMotion and confirm that every scene still shows the same message and end state.

The default composition renders without an audio file. Run bun run music, then set music to true in the Studio props when the bed is wanted.

FFmpeg must be installed and available on PATH only for bun run review:frames.

## Render and review

Run:

    bun run captions
    bun run render
    bun run render:vertical
    bun run review:frames
    bun run package

The frame command samples at 3fps. Also check the first and last frame of every scene. A successful render is not visual approval. The package command places both videos and the required VTT caption track in out/delivery. Upload the VTT beside the MP4 instead of treating it as an optional build artifact.

## Video components

The product shots come from the Better Design video components: agent and prompt screens, phone and laptop mockups, cropped screen recordings, terminal sessions, charts and counters, title reveals, captions, logo stings, social proof, transitions and backgrounds. List them with get-motion-guide({}) and load one with get-motion-guide({ component: "phone-mockup" }), or install it:

    npx shadcn@latest add https://better-design.com/registry/video/phone-mockup.json

The CLI writes the file into src/components/bd-video/ and the video kit into src/lib/bd-video/. Pass videoComponentTheme from src/video-component-theme.ts through the theme prop so the shot paints from the product's tokens.

## Design-system contract

- src/design-system.ts is the source of visual, motion and audio tokens.
- src/video-component-theme.ts maps those tokens onto the video components.
- src/formats.ts owns dimensions and safe areas. Vertical reflows; it does not shrink the landscape frame.
- src/brief.ts owns product content and sourced proof.
- src/timeline.ts owns scene order, lengths and caption cues.
- src/Video.tsx owns reusable scene rendering.

Use Better Design guidance for brand, story, hierarchy and review. Use the official Remotion skills for current APIs, Studio, media, captions and rendering.

Optional community libraries can supply a specialized pattern: RemotionUI, remocn and Remotion Bits. Ask before installing them, keep their provenance and license, and adapt their source to this video system instead of importing a demo style unchanged.
`,
  },
];

export const MOTION_SCAFFOLD_STEPS = [
  "Write every file in MOTION_SCAFFOLD_FILES into a `motion/` directory at the repository root. Keep it outside the app workspace because the first Remotion install downloads a large headless browser.",
  "Install and follow the official Remotion skills from https://www.remotion.dev/docs/ai/skills for current APIs and package versions.",
  "Replace the semantic tokens in src/design-system.ts with the product's existing design-system values.",
  "Replace every placeholder in src/brief.ts. When proof is present, keep its source URL and never invent a claim.",
  "Pick the product shots from the video components: get-motion-guide({}) lists them, get-motion-guide({ component: \"answer-reply\" }) returns one, and `npx shadcn@latest add https://better-design.com/registry/video/<name>.json` installs it into src/components/bd-video/. Pass videoComponentTheme from src/video-component-theme.ts through each component's theme prop.",
  "Run bun install, bun run check, bun run dev, bun run captions, bun run render, bun run render:vertical and bun run package.",
  "Install FFmpeg before bun run review:frames. Inspect every scene boundary and ask the user to watch both final renders. A successful render is not visual approval.",
].join("\n");
