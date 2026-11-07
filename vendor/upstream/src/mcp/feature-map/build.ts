// First draft of a feature map from a repository's file list. Routes become
// screens, a route's first static segment names its feature, and each chain of
// nested routes becomes a flow: `/settings/billing/cancel` is the flow
// Settings → Billing → Cancel. Components and data files join the step whose
// name they share. What no path can show (a dialog, an email) is left for the
// agent to add with update-feature-map. [BD-832]
import {
  FEATURE_MAP_LIMITS as LIMITS,
  slugify,
  type FeatureMap,
  type FeatureMapFeature,
  type FeatureMapFlow,
  type FeatureMapStep,
} from "./schema";

const IGNORED = /(^|\/)(node_modules|\.next|\.nuxt|\.svelte-kit|dist|build|out|coverage|\.git)\/|(\.test|\.spec|\.stories)\.[a-z]+$|(^|\/)__tests__\//;
const CODE_EXT = /\.(tsx|jsx|ts|js|mjs|mdx|vue|svelte)$/;
const UI_EXT = /\.(tsx|jsx|vue|svelte)$/;
/**
 * Page routes the build reads. The hosted server runs it on the Worker, so
 * this bounds the work one call can cost however long the file list is.
 */
export const MAX_ROUTES = 500;

/**
 * Path references the written map may hold. A step is shared by every flow
 * that passes through it and is written out once per flow, so a file placed on
 * it costs one reference per flow. The per-list limits alone multiply. [BD-832]
 */
const MAX_PATH_REFS = 20_000;

const DATA_DIRS = new Set(["server", "actions", "hooks", "queries", "mutations", "services", "api", "trpc", "routers"]);

type RouteKind = "page" | "api";

interface RouteFile {
  file: string;
  kind: RouteKind;
  route: string;
}

/** What the build produced, plus what it could not place or had to leave out. */
export interface FeatureMapBuild {
  map: FeatureMap;
  unmapped: string[];
  /** Page routes past `MAX_ROUTES` or the map's limits, left for the agent to add. */
  skippedRoutes: string[];
}

/** Turn route-folder segments into a URL path, or null for a private folder. */
function toRoute(segments: string[]): string | null {
  const out: string[] = [];
  for (const seg of segments) {
    if (/^\(.*\)$/.test(seg) || seg.startsWith("@")) continue;
    if (seg.startsWith("_")) return null;
    const param = /^\[{1,2}(?:\.\.\.)?([^\]]+)\]{1,2}$/.exec(seg);
    out.push(param ? `:${param[1]}` : seg);
  }
  return `/${out.join("/")}`;
}

/** Remix and React Router flat routes: `app/routes/settings.billing.tsx`. */
function flatRoute(base: string): string {
  const segs = base
    .split(".")
    .filter((s) => s !== "_index" && s !== "route" && !s.startsWith("_"))
    .map((s) => (s.startsWith("$") ? `:${s.slice(1) || "splat"}` : s.replace(/_$/, "")));
  return `/${segs.join("/")}`;
}

/** The route a file serves, when its path follows a known router convention. */
export function routeFromPath(file: string): RouteFile | null {
  if (IGNORED.test(file) || !CODE_EXT.test(file)) return null;
  const parts = file.split("/");
  const name = parts[parts.length - 1] ?? "";
  const base = name.replace(CODE_EXT, "");
  const dirs = parts.slice(0, -1);
  const kindOf = (route: string, api: boolean): RouteKind =>
    api || route === "/api" || route.startsWith("/api/") ? "api" : "page";

  const routesIdx = dirs.lastIndexOf("routes");
  // SvelteKit: src/routes/settings/+page.svelte
  if (routesIdx >= 0 && /^\+(page|server)$/.test(base)) {
    const route = toRoute(dirs.slice(routesIdx + 1));
    return route ? { file, route, kind: kindOf(route, base === "+server") } : null;
  }
  // Remix / React Router: app/routes/settings.billing.tsx
  if (routesIdx >= 1 && dirs[routesIdx - 1] === "app" && routesIdx === dirs.length - 1) {
    const route = flatRoute(base);
    return { file, route, kind: kindOf(route, false) };
  }
  // Next.js app router: app/settings/billing/page.tsx, app/api/x/route.ts
  const appIdx = dirs.lastIndexOf("app");
  if (appIdx >= 0 && (base === "page" || base === "route")) {
    const route = toRoute(dirs.slice(appIdx + 1));
    return route ? { file, route, kind: kindOf(route, base === "route") } : null;
  }
  // Next.js pages router and Nuxt: pages/settings/billing.tsx
  const pagesIdx = dirs.lastIndexOf("pages");
  if (pagesIdx >= 0 && !base.startsWith("_")) {
    const segs = [...dirs.slice(pagesIdx + 1), base].filter((s) => s !== "index");
    const route = toRoute(segs);
    return route ? { file, route, kind: kindOf(route, false) } : null;
  }
  return null;
}

/** Lower-case words of a path fragment, with a naive plural trimmed. */
function words(text: string): Set<string> {
  return new Set(
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

const staticSegments = (route: string): string[] =>
  route.split("/").filter((s) => s && !s.startsWith(":"));

const humanize = (seg: string): string => {
  const text = seg.replace(/[-_]+/g, " ").trim().slice(0, LIMITS.name);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const isAncestor = (a: string, b: string): boolean =>
  a !== b && (a === "/" || b.startsWith(`${a}/`));

function stepName(route: string, featureName: string): string {
  const segs = route.split("/").filter(Boolean);
  const last = segs[segs.length - 1];
  if (!last) return featureName;
  return last.startsWith(":") ? `${featureName} detail` : humanize(last);
}

function flowName(leaf: string, featureKey: string, featureName: string): string {
  const rest = staticSegments(leaf).filter((s, i) => !(i === 0 && s === featureKey));
  if (rest.length > 0) return humanize(rest.join(" "));
  return leaf.split("/").some((s) => s.startsWith(":"))
    ? `View ${featureName.toLowerCase()} detail`
    : `View ${featureName.toLowerCase()}`;
}

interface StepSlot {
  step: FeatureMapStep;
  route: string;
  /** The page file's folder with a trailing slash, or "" when no page file serves the route. */
  dir: string;
  /** How many flows pass through this step, so how many times its paths are written. */
  flows: number;
  tokens: Set<string>;
}

/** Build one feature's flows: one per leaf route, walking its ancestor routes. */
function buildFeature(key: string, pages: RouteFile[], slots: Map<string, StepSlot>, skipped: string[]): FeatureMapFeature {
  const name = key === "home" ? "Home" : humanize(key);
  const routes = [...new Set(pages.map((p) => p.route))].sort();
  const leaves = routes.filter((r) => !routes.some((o) => isAncestor(r, o)));
  skipped.push(...leaves.slice(LIMITS.flows));
  const ids = new Set<string>();
  const flows: FeatureMapFlow[] = leaves.slice(0, LIMITS.flows).map((leaf) => {
    const chain = routes.filter((r) => r === leaf || isAncestor(r, leaf)).slice(-LIMITS.steps);
    const title = flowName(leaf, key, name);
    const base = slugify(title);
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    const chainSlots = chain.map((r) => slotFor(r, pages, name, slots));
    for (const slot of chainSlots) slot.flows += 1;
    return { id, name: title, steps: chainSlots.map((slot) => slot.step) };
  });
  return { id: slugify(key), name, flows, components: [] };
}

/**
 * One step object per route, shared by every flow that passes through it, so a
 * component assigned to Settings shows in each Settings flow.
 */
function slotFor(route: string, pages: RouteFile[], featureName: string, slots: Map<string, StepSlot>): StepSlot {
  const existing = slots.get(route);
  if (existing) return existing;
  const page = pages.find((p) => p.route === route);
  const segs = staticSegments(route);
  const slot: StepSlot = {
    route,
    flows: 0,
    dir: page ? page.file.slice(0, page.file.lastIndexOf("/") + 1) : "",
    tokens: words(segs[segs.length - 1] ?? ""),
    step: { name: stepName(route, featureName), route, screen: page?.file, components: [], data: [] },
  };
  slots.set(route, slot);
  return slot;
}

/** The deepest step whose folder holds the file, or whose name the file shares. */
function matchStep(file: string, fileWords: Set<string>, slots: StepSlot[]): StepSlot | undefined {
  const depth = (s: StepSlot) => s.route.split("/").length;
  const colocated = slots
    .filter((s) => s.dir && file.startsWith(s.dir) && (s.route !== "/" || !file.slice(s.dir.length).includes("/")))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
  if (colocated) return colocated;
  return slots
    .filter((s) => s.tokens.size > 0 && [...s.tokens].every((t) => fileWords.has(t)))
    .sort((a, b) => depth(b) - depth(a))[0];
}

/** Words that identify a component or data file: its name and folders below the root. */
function fileWords(file: string): Set<string> {
  const parts = file.replace(CODE_EXT, "").split("/");
  const anchor = Math.max(parts.lastIndexOf("components"), ...[...DATA_DIRS].map((d) => parts.lastIndexOf(d)));
  return words(parts.slice(anchor >= 0 ? anchor + 1 : -2).join(" "));
}

const featureKeyOf = (route: string): string => staticSegments(route)[0] ?? "home";

/**
 * Draft a feature map from the paths in a repository (the output of
 * `git ls-files`). Deterministic: the same list always yields the same map.
 */
export function buildFeatureMap(files: string[], product?: string): FeatureMapBuild {
  const clean = [...new Set(files.map((f) => f.trim().replace(/^\.\//, "")).filter(Boolean))].sort();
  const routed = clean.map(routeFromPath).filter((r): r is RouteFile => r !== null);
  const allPages = routed.filter((r) => r.kind === "page");
  const pages = allPages.slice(0, MAX_ROUTES);
  const skippedRoutes = allPages.slice(MAX_ROUTES).map((p) => p.route);
  const apis = routed.filter((r) => r.kind === "api");
  const routeFiles = new Set(routed.map((r) => r.file));

  const byFeature = new Map<string, RouteFile[]>();
  for (const page of pages) {
    const key = featureKeyOf(page.route);
    const list = byFeature.get(key);
    if (list) list.push(page);
    else byFeature.set(key, [page]);
  }

  const slots = new Map<string, StepSlot>();
  const keys = [...byFeature.keys()].sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)));
  for (const key of keys.slice(LIMITS.features)) skippedRoutes.push(...(byFeature.get(key) ?? []).map((p) => p.route));
  const features = keys
    .slice(0, LIMITS.features)
    .map((key) => buildFeature(key, byFeature.get(key) ?? [], slots, skippedRoutes));
  const featureWords = features.map((f) => ({ feature: f, word: words(f.id).values().next().value ?? "" }));
  const allSlots = [...slots.values()];
  const unmapped: string[] = [];
  let refs = 0;
  /** Add a path to a list unless the list or the map's reference budget is full. */
  const place = (list: string[], file: string, cost: number): boolean => {
    if (list.length >= LIMITS.paths || refs + cost > MAX_PATH_REFS) return false;
    refs += cost;
    list.push(file);
    return true;
  };

  const isData = (file: string) => file.split("/").slice(0, -1).some((d) => DATA_DIRS.has(d));
  for (const file of clean) {
    if (IGNORED.test(file) || routeFiles.has(file) || !CODE_EXT.test(file)) continue;
    const inComponents = file.split("/").includes("components");
    const data = !inComponents && isData(file);
    const colocatedUi = UI_EXT.test(file) && allSlots.some((s) => s.dir && file.startsWith(s.dir) && s.route !== "/");
    if (!inComponents && !data && !colocatedUi) continue;
    const fw = fileWords(file);
    const slot = matchStep(file, fw, allSlots);
    if (slot && place(data ? slot.step.data : slot.step.components, file, slot.flows)) continue;
    const feature = data ? undefined : featureWords.find((f) => fw.has(f.word))?.feature;
    if (!feature || !place(feature.components, file, 1)) unmapped.push(file);
  }
  for (const api of apis) {
    const slot = matchStep(api.file, words(api.route), allSlots);
    if (!slot || !place(slot.step.data, api.file, slot.flows)) unmapped.push(api.file);
  }

  const map: FeatureMap = { version: 1, features };
  if (product) map.product = product;
  return { map, unmapped, skippedRoutes };
}
