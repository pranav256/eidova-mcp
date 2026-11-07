/**
 * The video components Better Design wrote and serves from its own registry,
 * handed to agents through get-motion-guide. The data lives in
 * video-components.generated.ts, built from video-components/better-design by
 * `bun run --cwd packages/mcp generate-registry`.
 */
import type { JsonValue } from "../../guards";
import { VIDEO_COMPONENT_CATALOG, VIDEO_COMPONENT_FILES } from "./video-components.generated";

export { VIDEO_COMPONENT_CATALOG, VIDEO_COMPONENT_FILES };

/** One file a registry item writes into the consumer's project. */
export interface VideoComponentFile {
  /** Path inside video-components/, and the key in VIDEO_COMPONENT_FILES. */
  path: string;
  /** Where the shadcn CLI writes the file, relative to the project's `@/` root. */
  target: string;
  type: string;
}

/** A prop default: any JSON value, such as a text, a list or a camera keyframe. */
export type VideoComponentPropDefault = JsonValue;

/** Prop defaults keyed by prop name. */
export type VideoComponentPropDefaults = { [key: string]: VideoComponentPropDefault };

/** Source text keyed by the path inside video-components/. */
export type VideoComponentSources = { [path: string]: string };

/** One installable video component or library, with the metadata an agent needs to pick it. */
export interface VideoComponentItem {
  name: string;
  title: string;
  description: string;
  /** Catalog group, for example `ai-input`, `screens`, `text`, `primitives`. */
  group: string;
  type: string;
  /** npm packages the item imports. The shadcn CLI installs them. */
  dependencies: string[];
  /** npm packages the project needs only to type-check the item. */
  devDependencies?: string[];
  /** Other items in this catalog the shadcn CLI installs with it. */
  registryDependencies: string[];
  /** Items that come from the shadcn registry itself, such as `utils`. */
  externalRegistryDependencies: string[];
  files: VideoComponentFile[];
  /** Exported React component name. Absent on a library item. A transition's demo scene. */
  component?: string;
  /** A transition's presentation factory, such as `whipPan`, for TransitionSeries. */
  factory?: string;
  importPath?: string;
  /** Natural length at `fps`. */
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Prop defaults, as the gallery and the plan use them. */
  props?: VideoComponentPropDefaults;
}

/** Where the registry items are served. Matches packages/web/public/registry/video. */
export const VIDEO_REGISTRY_BASE_URL = "https://better-design.com/registry/video";

const GROUP_ORDER: Array<[group: string, label: string]> = [
  ["ai-input", "AI chat input"],
  ["screens", "Screens and devices"],
  ["scenes", "Scenes"],
  ["charts", "Charts and numbers"],
  ["text", "Text and titles"],
  ["captions", "Captions"],
  ["logos", "Logos"],
  ["social", "Social proof"],
  ["transitions", "Transitions, for TransitionSeries"],
  ["backgrounds", "Backgrounds"],
  ["effects", "Effects"],
  ["templates", "Film templates: whole films built from the components above"],
  ["primitives", "Primitives, installed automatically as dependencies"],
];

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The install command for one item. The CLI resolves its dependencies from the same registry. */
export function videoComponentInstallCommand(name: string): string {
  return `npx shadcn@latest add ${VIDEO_REGISTRY_BASE_URL}/${name}.json`;
}

/** Find an item by name, title, or component name. Returns undefined when nothing matches. */
export function findVideoComponent(query: string): VideoComponentItem | undefined {
  const key = normalize(query);
  return VIDEO_COMPONENT_CATALOG.find(
    (item) =>
      item.name === key ||
      normalize(item.title) === key ||
      (item.component !== undefined && normalize(item.component) === key),
  );
}

/** The full catalog grouped for a product demo, shortest read first. */
export function formatVideoComponentIndex(): string {
  const lines = [
    "# Video components",
    "",
    `${VIDEO_COMPONENT_CATALOG.length} Remotion components written by Better Design. Load one with get-motion-guide({ component: "<name>" }), or install it with \`${videoComponentInstallCommand("<name>")}\`. Every scene component takes a \`theme\` prop; pass the product's tokens so the film matches the app.`,
  ];
  for (const [group, label] of GROUP_ORDER) {
    const items = VIDEO_COMPONENT_CATALOG.filter((item) => item.group === group);
    if (items.length === 0) continue;
    lines.push("", `## ${label}`, "");
    for (const item of items) {
      const length = item.durationInFrames ? ` (${item.durationInFrames} frames at ${item.fps ?? 30} fps)` : "";
      lines.push(`- ${item.name}${length}: ${item.description}`);
    }
  }
  return lines.join("\n");
}

function formatProps(props: VideoComponentPropDefaults): string {
  return Object.entries(props)
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
    .join("\n");
}

/** One item as writable files plus the facts an agent needs to place it on the timeline. */
export function formatVideoComponent(item: VideoComponentItem): string {
  const deps = [...item.registryDependencies, ...item.externalRegistryDependencies];
  const sections = [
    `# ${item.title} (${item.name})`,
    "",
    item.description,
    "",
    `Install: ${videoComponentInstallCommand(item.name)}`,
    "Source: written by Better Design for this registry.",
  ];
  if (item.importPath && item.factory) {
    sections.push(
      `Import: import { ${item.factory} } from "${item.importPath}";`,
      `Use: <TransitionSeries.Transition presentation={${item.factory}()} timing={linearTiming({ durationInFrames: 15 })} />. The timing you pass sets how long the cut lasts.`,
      `${item.component} is the gallery demo, two cards and the cut between them, ${item.durationInFrames ?? 0} frames long. Do not budget the film from it.`,
    );
  } else if (item.importPath) sections.push(`Import: import { ${item.component} } from "${item.importPath}";`);
  if (item.width && item.height) {
    sections.push(
      item.width > item.height
        ? `Designed for ${item.width}x${item.height}. It lays out for landscape: check it at every target format before you use it in a vertical film.`
        : `Designed for ${item.width}x${item.height}.`,
    );
  }
  if (item.durationInFrames && !item.factory) {
    sections.push(`Natural length: ${item.durationInFrames} frames at ${item.fps ?? 30} fps. Budget the timeline from this, not from a guess.`);
  }
  if (item.dependencies.length > 0) sections.push(`npm dependencies: ${item.dependencies.join(", ")}`);
  if (deps.length > 0) sections.push(`Registry dependencies: ${deps.join(", ")}. The install command brings them in.`);
  if (item.props && Object.keys(item.props).length > 0) sections.push("", "## Prop defaults", "", formatProps(item.props));
  sections.push("", "## Files", "");
  for (const file of item.files) {
    sections.push(`--- ${file.target} ---`, VIDEO_COMPONENT_FILES[file.path] ?? "", "");
  }
  sections.push(
    "Adapt colours, type and radius to the active video tokens through `theme`. Do not import the demo style unchanged. Review it against get-review-rules({ category: \"motion\" }) and render-test it in every target format.",
  );
  return sections.join("\n");
}

/** The response for get-motion-guide({ component }): the item, or the index when the name is unknown. */
export function renderVideoComponent(query: string): string {
  const item = findVideoComponent(query);
  if (item) return formatVideoComponent(item);
  return `No video component named "${query}". Pick one of these names.\n\n${formatVideoComponentIndex()}`;
}
