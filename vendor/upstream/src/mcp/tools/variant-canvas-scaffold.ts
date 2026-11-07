// The "variant-canvas" kind of get-jig-guide. A jig tunes one surface; the
// canvas lays several variants of a component or screen side by side, built
// with the project's own components, so the person compares, tunes and keeps
// frames and pastes the picks back. The agent writes these files into the
// person's app as a development-only route. Each frame renders in an iframe
// with the app's styles copied in, so frame widths meet the app's real
// breakpoints and a dark frame gets the app's real dark tokens.
//
// The scaffold below must contain no backtick and no dollar-brace, because it
// sits inside String.raw template literals. The jig
// test extracts these files from the tool output and type-checks them.

const VARIANT_CANVAS_GUIDE = `# Lay out variants on a canvas

The person wants to see options, not read about them. Instead of building one version and describing it in chat, put several variants side by side on a canvas inside their own app, built with their own components, and let them pick by eye.

## The loop

1. Read the project first: its components, its tokens and the screen the variant belongs on. Every frame uses the project's real components, never copies.
2. Write the two files below into the project, then add the route for its framework. Keep the import paths as they are if the project has the \`@/\` alias for \`src/\`; otherwise fix them.
3. Fill \`frames.tsx\` with 3 to 6 frames. Each frame differs from the others in one thing worth deciding: a layout, a state (empty, loading, error, success), a size, a theme, a density, or a design system. Show the same content in every frame, so the person compares the design and not the copy.
4. Score each frame honestly from 0 to 10 against the goal, with one line on why. Rework any frame below 7 before you show the canvas, unless it is there on purpose as a contrast, and say so in its \`why\`.
5. Give a frame \`params\` for the taste values you cannot defend, such as padding, radius, gap or font size. Same spec as the jig: \`[default, min, max, step?]\` is a slider, a boolean a checkbox, \`{ options, default }\` a select.
6. Tell the person the URL, for example http://localhost:3000/dev/canvas, and what to look at. On the canvas they pan and zoom, drag frames, tune, compare 2 frames side by side, keep the ones they like with a note, and click Copy picks.
7. When the JSON comes back, write the kept frame into the real component with the exact values in \`picks\`. Read every \`note\`: it may ask to combine frames, and \`tuned\` holds values the person changed on frames they did not keep. Then delete \`src/dev/canvas/\` and the route, put \`main.tsx\` back if you changed it for Vite, and say what you shipped.

## Rules

- The canvas is scaffolding. It renders only in development and it never ships.
- Each frame renders in its own iframe with the app's styles copied in, so a 360px frame meets the app's real mobile breakpoints and \`theme: "dark"\` gets the app's real dark tokens. A frame without a theme follows the app's theme, and changes with it.
- A frame grows to fit a component. For a whole screen that fills the viewport, give the frame a \`height\` too, such as 844 for a phone.
- Menus, popovers, selects and dialogs portal to the page body, which sits behind the canvas. Pass \`container={useFrameContainer()}\` to their Portal so they open inside the frame. The frames file shows this with a select. A shadcn wrapper such as \`SelectContent\` may not take a \`container\` prop yet: add one that it passes to its Portal.
- Several frames render the same component, so ids must be unique: use \`useId()\` for any \`id\` and \`htmlFor\`.
- A frame renders inside the app's React tree, so providers from the root layout reach it. A component that needs a provider the layout lacks gets it inside its frame.
- Frames copy the app's \`<link>\` and \`<style>\` tags. Styles a CSS-in-JS library inserts through \`insertRule\` do not reach them; turn off its speedy mode in development, or render that content outside a frame.
- Picks persist in localStorage under \`bd-canvas:<name>\`, so a reload keeps the person's work. Change \`name\` to start a fresh canvas.

For tuning values on one surface the person already chose, call get-jig-guide with kind "tune-in-place" instead.
`;

const VARIANT_CANVAS_FILE = String.raw`--- src/dev/canvas/variant-canvas.tsx ---
"use client";
// TEMPORARY variant canvas. The agent lays out one frame per variant in
// frames.tsx, using this project's real components. The person pans, zooms,
// tunes, compares and keeps frames, then clicks "Copy picks" and pastes the
// JSON back to the agent. The agent writes the kept variant into the real
// component and DELETES src/dev/canvas and the dev route.
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

// Same param spec as the jig: [default, min, max, step?] renders a slider,
// boolean a checkbox, { options, default } a select, string a text input.
type SliderSpec = [number, number, number] | [number, number, number, number];
type SelectSpec = { options: string[]; default?: string };
export type ParamSpec = Record<string, SliderSpec | SelectSpec | boolean | string>;
export type ParamValues = Record<string, number | boolean | string>;

export type Frame = {
  /** Stable id, such as "card-compact". The person's picks refer to it. */
  id: string;
  /** What differs in this frame, in a few words. */
  label: string;
  /** Viewport width of the frame in CSS pixels. Defaults to 360. */
  width?: number;
  /**
   * Viewport height in CSS pixels, for a whole screen. Without it the frame
   * grows to fit its content, which suits a component but not a page that
   * fills the viewport with min-h-screen or 100vh.
   */
  height?: number;
  /** Adds the "dark" class and data-theme to the frame for dark-mode variants. */
  theme?: "light" | "dark";
  /** Extra class on the frame body, for a design-system or brand scope. */
  className?: string;
  /** The agent's own rating of this variant, 0 to 10. */
  score?: number;
  /** One line on why it earned that score. */
  why?: string;
  /** Values the person may tune on this frame alone. */
  params?: ParamSpec;
  render: (values: ParamValues) => ReactNode;
};

export type CanvasSpec = {
  /** Name of the canvas. Also the localStorage key, so keep it stable. */
  name: string;
  /** The job the variants must do, in one sentence. */
  goal?: string;
  frames: Frame[];
};

type Point = { x: number; y: number };
type Camera = Point & { zoom: number };
type Saved = {
  positions: Record<string, Point>;
  values: Record<string, ParamValues>;
  kept: string[];
  notes: Record<string, string>;
};

const GAP = 64;
const DEFAULT_WIDTH = 360;
const FALLBACK_HEIGHT = 400;
const EMPTY_SAVED: Saved = { positions: {}, values: {}, kept: [], notes: {} };
const ROW_WIDTH = 1800;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

function defaultsOf(spec: ParamSpec | undefined): ParamValues {
  const out: ParamValues = {};
  for (const [key, def] of Object.entries(spec ?? {})) {
    if (Array.isArray(def)) out[key] = def[0];
    else if (typeof def === "object") out[key] = def.default ?? def.options[0];
    else out[key] = def;
  }
  return out;
}

const widthOf = (f: Frame) => f.width ?? DEFAULT_WIDTH;

function load(key: string): Saved {
  try {
    return { ...EMPTY_SAVED, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    // Private mode or a corrupt entry: start a fresh layout, nothing is lost.
    return EMPTY_SAVED;
  }
}

const ink = "oklch(0.25 0.01 260)";
const muted = "oklch(0.52 0.01 260)";
const line = "oklch(0.88 0.005 260)";
const accent = "oklch(0.55 0.2 260)";

const chrome: CSSProperties = {
  font: "500 0.75rem/1.4 ui-sans-serif, system-ui, sans-serif",
  color: ink,
};
const button: CSSProperties = {
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  minHeight: "1.75rem",
  padding: "0 0.625rem",
  borderRadius: "0.5rem",
  borderWidth: "0.0625rem",
  borderStyle: "solid",
  borderColor: line,
  background: "oklch(1 0 0)",
};
const pressed: CSSProperties = {
  ...button,
  background: "oklch(0.95 0.03 260)",
  borderColor: accent,
  color: accent,
};
const primary: CSSProperties = {
  ...button,
  background: ink,
  borderColor: ink,
  color: "oklch(0.99 0 0)",
};
const heading: CSSProperties = { font: "inherit", fontWeight: 600, margin: 0 };
const bar: CSSProperties = {
  ...chrome,
  position: "fixed",
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem",
  background: "oklch(1 0 0 / 0.92)",
  border: "0.0625rem solid " + line,
  borderRadius: "0.75rem",
  boxShadow: "0 0.25rem 1rem oklch(0 0 0 / 0.08)",
};

function Control(props: {
  name: string;
  def: ParamSpec[string];
  value: number | boolean | string;
  onChange: (value: number | boolean | string) => void;
}) {
  const { name, def, value, onChange } = props;
  const id = useId();
  let input: ReactNode;
  if (Array.isArray(def)) {
    const [, min, max, step] = def;
    input = (
      <>
        <input id={id} type="range" min={min} max={max} step={step ?? (max - min) / 100}
          value={Number(value)} onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: accent }} />
        <span style={{ width: "2.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {Number(Number(value).toFixed(2))}
        </span>
      </>
    );
  } else if (typeof def === "object") {
    input = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} style={button}>
        {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (typeof def === "boolean") {
    input = <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
  } else {
    input = <input id={id} type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} style={{ ...button, cursor: "text", flex: 1 }} />;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <label htmlFor={id} style={{ width: "5.5rem", color: muted }}>{name}</label>
      {input}
    </div>
  );
}

const FrameBody = createContext<HTMLElement | null>(null);

/**
 * The body of the frame a component renders in. Menus, popovers and dialogs
 * portal to the page body by default, which sits behind the canvas, so pass
 * this as the container of their Portal to open them inside the frame.
 */
export function useFrameContainer() {
  return useContext(FrameBody);
}

type WheelInput = { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean; clientX: number; clientY: number };

// Each frame renders in a same-origin iframe, so its width triggers the app's
// own breakpoints and its theme does not inherit the page's. The app's styles
// are copied in and kept in sync; React context still flows through the portal.
function FrameView(props: { frame: Frame; values: ParamValues; onWheel?: (e: WheelInput) => void; onSized?: () => void }) {
  const { frame, values, onWheel, onSized } = props;
  const sizedRef = useRef(onSized);
  sizedRef.current = onSized;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(240);

  const setup = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    const copyStyles = () => {
      doc.head.querySelectorAll("[data-canvas-copy]").forEach((n) => n.remove());
      document.head.querySelectorAll("link[rel=stylesheet], style").forEach((n) => {
        const clone = n.cloneNode(true) as HTMLElement;
        clone.setAttribute("data-canvas-copy", "");
        doc.head.appendChild(clone);
      });
      // A frame without a theme follows the app: its class, data-theme and
      // color-scheme. A frame with one forces it.
      const page = document.documentElement;
      const classes = new Set(page.className.split(" ").filter(Boolean));
      if (frame.theme === "dark") classes.add("dark");
      if (frame.theme === "light") classes.delete("dark");
      doc.documentElement.className = Array.from(classes).join(" ");
      const dataTheme = frame.theme ?? page.getAttribute("data-theme");
      if (dataTheme) doc.documentElement.setAttribute("data-theme", dataTheme);
      else doc.documentElement.removeAttribute("data-theme");
      const scheme = frame.theme ?? page.style.colorScheme;
      doc.documentElement.style.colorScheme = scheme;
      // The iframe element's own color-scheme drives prefers-color-scheme inside it.
      iframe.style.colorScheme = scheme;
      doc.body.className = [document.body.className, frame.className ?? ""].join(" ").trim();
    };
    copyStyles();
    doc.body.style.margin = "0";
    // The frame sizes itself to its content, so it never scrolls: drop any
    // scrollbar gutter the app reserves on its own pages.
    doc.documentElement.style.overflow = frame.height ? "auto" : "hidden";
    doc.documentElement.style.scrollbarGutter = "auto";
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    const sizes = new ResizeObserver(() => {
      // Capped, so content that sizes itself from the viewport cannot grow forever.
      setHeight(Math.min(4000, Math.max(40, root.scrollHeight)));
      sizedRef.current?.();
    });
    sizes.observe(root);
    const styles = new MutationObserver(() => copyStyles());
    styles.observe(document.head, { childList: true, subtree: true, characterData: true });
    styles.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    // Wheel events land in the iframe, so pan and zoom would stop over a frame.
    // Forward them to the canvas with coordinates in the outer page.
    const forward = (e: WheelEvent) => {
      if (!wheelRef.current) return;
      e.preventDefault();
      const r = iframe.getBoundingClientRect();
      const k = r.width / iframe.offsetWidth;
      wheelRef.current({ deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
        clientX: r.left + e.clientX * k, clientY: r.top + e.clientY * k });
    };
    doc.addEventListener("wheel", forward, { passive: false });
    // Escape inside a frame still closes the canvas panels.
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    };
    doc.addEventListener("keydown", escape);
    setMount(root);
    return () => {
      sizes.disconnect();
      styles.disconnect();
      doc.removeEventListener("wheel", forward);
      doc.removeEventListener("keydown", escape);
      root.remove();
    };
  };

  // A server-rendered iframe can finish loading before React hydrates and
  // attaches onLoad, so check the document first and only then wait for load.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cleanup: (() => void) | undefined;
    const run = () => { cleanup?.(); cleanup = setup(); };
    const doc = iframe.contentDocument;
    if (doc && doc.readyState === "complete" && doc.URL === "about:srcdoc") run();
    iframe.addEventListener("load", run);
    return () => { iframe.removeEventListener("load", run); cleanup?.(); };
    // setup reads the frame's theme and class; a change to either remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.theme, frame.className, frame.height]);

  return (
    <>
    <iframe
      ref={iframeRef}
      title={frame.label}
      srcDoc="<!doctype html><html><head></head><body></body></html>"
      style={{
        display: "block",
        width: widthOf(frame) + "px",
        height: (frame.height ?? height) + "px",
        border: 0,
        borderRadius: "0.75rem",
        boxShadow: "0 0 0 0.0625rem " + line + ", 0 0.5rem 1.5rem oklch(0 0 0 / 0.06)",
        background: "transparent",
      }}
    />
    {mount
      ? createPortal(<FrameBody.Provider value={mount.ownerDocument.body}>{frame.render(values)}</FrameBody.Provider>, mount)
      : null}
    </>
  );
}

/** Pan-and-zoom board of variant frames, with tuning, compare and keep. */
export function VariantCanvas({ spec }: { spec: CanvasSpec }) {
  const storageKey = "bd-canvas:" + spec.name;
  const [saved, setSaved] = useState<Saved>(EMPTY_SAVED);
  const [camera, setCamera] = useState<Camera>({ x: 48, y: 120, zoom: 1 });
  const [inspect, setInspect] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const compareButton = useRef<HTMLButtonElement | null>(null);
  const wasComparing = useRef(false);
  // Leaving the comparison puts focus back on the button that opened it.
  useEffect(() => {
    if (wasComparing.current && !comparing) compareButton.current?.focus();
    wasComparing.current = comparing;
  }, [comparing]);
  // While comparing, the canvas behind is hidden, so it leaves the tab order.
  const behind: CSSProperties = comparing ? { visibility: "hidden" } : {};
  const [exported, setExported] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const frameRefs = useRef<Record<string, HTMLElement | null>>({});
  const drag = useRef<{ kind: "pan" | "frame"; id?: string; start: Point; origin: Point } | null>(null);
  // Frames are iframes filled in the browser, so render them after mount only.
  const [mounted, setMounted] = useState(false);
  const [sized, setSized] = useState<Record<string, true>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Read the person's saved layout, values and picks once, after mount.
  useEffect(() => {
    setSaved(load(storageKey));
    setMounted(true);
  }, [storageKey]);
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      // Storage full or blocked: the canvas still works, it only forgets on reload.
    }
  }, [saved, storageKey, mounted]);

  // Place every frame that has no saved position in rows, using real heights.
  useLayoutEffect(() => {
    const missing = spec.frames.filter((f) => !saved.positions[f.id]);
    if (missing.length === 0) return;
    // Wait until every frame has rendered and reported its real height.
    if (spec.frames.some((f) => !sized[f.id])) return;
    const positions: Record<string, Point> = {};
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const f of spec.frames) {
      const width = widthOf(f);
      const height = frameRefs.current[f.id]?.offsetHeight ?? FALLBACK_HEIGHT;
      if (x > 0 && x + width > ROW_WIDTH) {
        x = 0;
        y += rowHeight + GAP;
        rowHeight = 0;
      }
      positions[f.id] = { x, y };
      x += width + GAP;
      rowHeight = Math.max(rowHeight, height);
    }
    setSaved((s) => ({ ...s, positions: { ...positions, ...s.positions } }));
  }, [spec.frames, saved.positions, sized]);

  // Show every frame the first time the canvas opens.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !mounted) return;
    if (spec.frames.some((f) => !saved.positions[f.id])) return;
    fitted.current = true;
    // Frames grow to their content after their styles load; fit after that.
    setTimeout(fit, 300);
  });

  const valuesOf = (f: Frame) => ({ ...defaultsOf(f.params), ...saved.values[f.id] });
  const toggle = (list: string[], id: string, max = Infinity) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(-max);

  const zoomAt = (factor: number, at: Point) =>
    setCamera((c) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor));
      const k = zoom / c.zoom;
      return { zoom, x: at.x - (at.x - c.x) * k, y: at.y - (at.y - c.y) * k };
    });

  const zoomBy = (factor: number) => zoomAt(factor, { x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const fit = () => {
    const boxes = spec.frames.map((f) => {
      const p = saved.positions[f.id] ?? { x: 0, y: 0 };
      return { ...p, w: widthOf(f), h: frameRefs.current[f.id]?.offsetHeight ?? FALLBACK_HEIGHT };
    });
    if (boxes.length === 0) return;
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h + 120));
    const zoom = Math.min(1, (window.innerWidth - 96) / (maxX - minX), (window.innerHeight - 160) / (maxY - minY));
    setCamera({ zoom, x: 48 - minX * zoom, y: 120 - minY * zoom });
  };

  // Keyboard: arrows pan, = and - zoom, 0 fits, Escape closes a panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "=" || e.key === "+") zoomBy(1.2);
      else if (e.key === "-") zoomBy(1 / 1.2);
      else if (e.key === "0") fit();
      else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 240 : 60;
        const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
        setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
      }
      else if (e.key === "Escape") { setComparing(false); setExported(null); setInspect(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onWheel = (e: WheelInput) => {
    // Pinch and ctrl or cmd + wheel zoom at the pointer. Plain wheel pans.
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-Math.max(-25, Math.min(25, e.deltaY)) * 0.01), { x: e.clientX, y: e.clientY });
    else setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
  };

  // A native listener, because React's wheel listener is passive and could not
  // stop ctrl + wheel from zooming the whole browser page.
  const wheelHandler = useRef(onWheel);
  wheelHandler.current = onWheel;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-canvas-chrome]")) return;
      e.preventDefault();
      wheelHandler.current(e);
    };
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  const startDrag = (e: ReactPointerEvent, kind: "pan" | "frame", id?: string) => {
    if (e.button !== 0) return;
    const origin = kind === "frame" && id ? saved.positions[id] ?? { x: 0, y: 0 } : { x: camera.x, y: camera.y };
    drag.current = { kind, id, start: { x: e.clientX, y: e.clientY }, origin };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.start.x;
    const dy = e.clientY - d.start.y;
    if (d.kind === "pan") setCamera((c) => ({ ...c, x: d.origin.x + dx, y: d.origin.y + dy }));
    else if (d.id) {
      const id = d.id;
      setSaved((s) => ({ ...s, positions: { ...s.positions, [id]: { x: d.origin.x + dx / camera.zoom, y: d.origin.y + dy / camera.zoom } } }));
    }
  };
  const endDrag = () => { drag.current = null; };

  const picks = () => ({
    canvas: spec.name,
    goal: spec.goal,
    picks: spec.frames
      .filter((f) => saved.kept.includes(f.id))
      .map((f) => ({ id: f.id, label: f.label, values: valuesOf(f), note: saved.notes[f.id] ?? "" })),
    // Values the person changed on frames they did not keep: a note may refer to them.
    tuned: spec.frames
      .filter((f) => !saved.kept.includes(f.id) && saved.values[f.id])
      .map((f) => ({ id: f.id, label: f.label, values: valuesOf(f) })),
  });
  const copyPicks = () => {
    const json = JSON.stringify(picks(), null, 2);
    setExported(json);
    navigator.clipboard.writeText(json).then(
      () => {
        setStatus("Copied " + saved.kept.length + (saved.kept.length === 1 ? " pick" : " picks") + ". Paste it to your agent.");
        setTimeout(() => setStatus(""), 4000);
      },
      () => setStatus("Copy failed. Select the text and copy it by hand."),
    );
  };

  const comparedFrames = spec.frames.filter((f) => compare.includes(f.id));
  const inspected = spec.frames.find((f) => f.id === inspect);
  const inspectedValues = inspected ? valuesOf(inspected) : {};

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        // clip, not hidden: focus moving into an off-screen frame must not
        // scroll the canvas root, which nothing could scroll back.
        overflow: "clip",
        touchAction: "none",
        background: "oklch(0.965 0.003 260)",
        backgroundImage: "radial-gradient(oklch(0.82 0.005 260) 0.0625rem, transparent 0.0625rem)",
        backgroundSize: 24 * camera.zoom + "px " + 24 * camera.zoom + "px",
        backgroundPosition: camera.x + "px " + camera.y + "px",
      }}
    >
      <div
        aria-hidden
        onPointerDown={(e) => startDrag(e, "pan")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        style={{ position: "absolute", inset: 0, cursor: drag.current?.kind === "pan" ? "grabbing" : "grab" }}
      />

      <main
        aria-label={spec.name + " variants"}
        style={{
          ...behind,
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          transform: "translate(" + camera.x + "px, " + camera.y + "px) scale(" + camera.zoom + ")",
        }}
      >
        {spec.frames.map((f) => {
          const p = saved.positions[f.id] ?? { x: 0, y: 0 };
          const kept = saved.kept.includes(f.id);
          const values = valuesOf(f);
          return (
            <section
              key={f.id}
              aria-label={f.label}
              ref={(el) => { frameRefs.current[f.id] = el; }}
              style={{ ...chrome, position: "absolute", left: p.x, top: p.y, width: widthOf(f) + "px", visibility: saved.positions[f.id] ? "visible" : "hidden" }}
            >
              <header
                onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("button")) startDrag(e, "frame", f.id); }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                style={{ cursor: "move", paddingBottom: "0.5rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <h2 style={{ ...heading, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.label}
                  </h2>
                  {f.params ? (
                    <button type="button" aria-expanded={inspect === f.id} style={inspect === f.id ? pressed : button}
                      onClick={() => setInspect((i) => (i === f.id ? null : f.id))}>Tune</button>
                  ) : null}
                  <button type="button" aria-pressed={compare.includes(f.id)} style={compare.includes(f.id) ? pressed : button}
                    onClick={() => setCompare((c) => toggle(c, f.id, 2))}>Compare</button>
                  <button type="button" aria-pressed={kept} style={kept ? pressed : button}
                    onClick={() => {
                      setSaved((s) => ({ ...s, kept: toggle(s.kept, f.id) }));
                      setInspect(kept ? null : f.id);
                    }}>{kept ? "Kept" : "Keep"}</button>
                </div>
                <p style={{ margin: "0.125rem 0 0", color: muted }}>
                  {widthOf(f) + "px"}
                  {f.theme === "dark" ? " · dark" : ""}
                  {f.score !== undefined ? " · agent score " + f.score + "/10" : ""}
                  {f.why ? " · " + f.why : ""}
                </p>
              </header>
              {mounted ? (
                <FrameView frame={f} values={values} onWheel={onWheel}
                  onSized={() => setSized((s) => (s[f.id] ? s : { ...s, [f.id]: true }))} />
              ) : null}
            </section>
          );
        })}
      </main>

      <nav aria-label="Canvas" style={{ ...bar, ...behind, top: "1rem", left: "1rem", right: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "12rem" }}>
          <h1 style={heading}>{spec.name}</h1>
          {spec.goal ? <p style={{ margin: 0, color: muted }}>{spec.goal}</p> : null}
        </div>
        <span role="status" aria-live="polite" style={{ color: muted }}>
          {status || spec.frames.length + " frames · " + saved.kept.length + " kept"}
        </span>
        <button type="button" ref={compareButton} style={button} disabled={compare.length !== 2}
          onClick={() => setComparing(true)}>
          {compare.length === 2 ? "Compare 2 side by side" : "Pick 2 to compare"}
        </button>
        <button type="button" style={saved.kept.length ? primary : button} disabled={saved.kept.length === 0} onClick={copyPicks}>
          Copy picks
        </button>
      </nav>

      {inspected ? (
        <aside aria-label={"Frame: " + inspected.label} data-canvas-chrome=""
          style={{ ...bar, ...behind, background: "oklch(1 0 0)", flexDirection: "column", alignItems: "stretch", gap: "0.625rem", top: "5.5rem", right: "1rem", width: "18rem", maxHeight: "calc(100vh - 11rem)", overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ ...heading, flex: 1 }}>{inspected.label}</h2>
            <button type="button" style={button} onClick={() => setInspect(null)}>Close</button>
          </div>
          {saved.kept.includes(inspected.id) ? (
            <textarea
              aria-label={"Note on " + inspected.label}
              placeholder="What to keep or change in this frame"
              value={saved.notes[inspected.id] ?? ""}
              onChange={(e) => { const note = e.target.value; const id = inspected.id; setSaved((s) => ({ ...s, notes: { ...s.notes, [id]: note } })); }}
              style={{ ...button, cursor: "text", minHeight: "4.5rem", padding: "0.5rem", resize: "vertical" }}
            />
          ) : null}
          {inspected.params ? (
            <>
              {Object.entries(inspected.params).map(([key, def]) => (
                <Control key={key} name={key} def={def} value={inspectedValues[key]}
                  onChange={(v) => { const id = inspected.id; setSaved((s) => ({ ...s, values: { ...s.values, [id]: { ...inspectedValues, [key]: v } } })); }} />
              ))}
              <button type="button" style={{ ...button, alignSelf: "start" }}
                onClick={() => { const id = inspected.id; setSaved((s) => { const next = { ...s.values }; delete next[id]; return { ...s, values: next }; }); }}>
                Reset values
              </button>
            </>
          ) : null}
        </aside>
      ) : null}

      <div role="group" aria-label="Zoom" style={{ ...bar, ...behind, bottom: "1rem", right: "1rem" }}>
        <button type="button" style={button} aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
        <span style={{ width: "3rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{Math.round(camera.zoom * 100)}%</span>
        <button type="button" style={button} aria-label="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
        <button type="button" style={button} onClick={fit}>Fit all</button>
        <button type="button" style={button} onClick={() => setSaved((s) => ({ ...s, positions: {} }))}>Tidy layout</button>
      </div>


      {comparing && comparedFrames.length === 2 ? (
        <div role="dialog" aria-label="Compare two variants" data-canvas-chrome=""
          style={{ ...chrome, position: "fixed", inset: 0, zIndex: 20, overflow: "auto", background: "oklch(0.965 0.003 260)", padding: "4.5rem 2rem 2rem" }}>
          <div style={{ ...bar, top: "1rem", left: "1rem", right: "1rem" }}>
            <h2 style={{ ...heading, flex: 1 }}>Side by side at 100%</h2>
            <button type="button" style={button} autoFocus onClick={() => setComparing(false)}>Back to canvas</button>
          </div>
          <div style={{ display: "flex", gap: "2rem", alignItems: "flex-start", justifyContent: "center" }}>
            {comparedFrames.map((f) => (
              <section key={f.id} aria-label={f.label}>
                <h3 style={{ ...heading, margin: "0 0 0.5rem" }}>{f.label}</h3>
                <FrameView frame={f} values={valuesOf(f)} />
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {exported ? (
        <div role="dialog" aria-label="Your picks" data-canvas-chrome=""
          style={{ ...bar, flexDirection: "column", alignItems: "stretch", right: "1rem", bottom: "4.5rem", width: "min(26rem, calc(100vw - 2rem))", zIndex: 30 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 style={{ ...heading, flex: 1 }}>Paste this to your agent</h2>
            <button type="button" style={button} onClick={() => setExported(null)}>Close</button>
          </div>
          <textarea readOnly aria-label="Picks as JSON" value={exported} onFocus={(e) => e.target.select()}
            style={{ ...button, cursor: "text", height: "14rem", padding: "0.5rem", font: "0.6875rem/1.5 ui-monospace, monospace", resize: "vertical" }} />
        </div>
      ) : null}
    </div>
  );
}`;

const VARIANT_FRAMES_FILE = String.raw`--- src/dev/canvas/frames.tsx ---
"use client";
// The agent writes one frame per variant here, with the project's real
// components. Delete this folder once the person's pick is in the code.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useId } from "react";
import { type CanvasSpec, type ParamValues, useFrameContainer, VariantCanvas } from "./variant-canvas";

function PlanPicker() {
  // Menus portal to the page body, behind the canvas: open them in the frame.
  const container = useFrameContainer();
  return (
    <Select defaultValue="team">
      <SelectTrigger aria-label="Plan"><SelectValue /></SelectTrigger>
      <SelectContent container={container}>
        <SelectItem value="solo">Solo</SelectItem>
        <SelectItem value="team">Team</SelectItem>
        <SelectItem value="business">Business</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TrialCard(props: { values: ParamValues; layout: "stacked" | "inline"; error?: boolean; badge?: boolean; wide?: boolean; plan?: boolean }) {
  const { values, layout, error, badge, wide, plan } = props;
  const id = useId();
  const pad = Number(values.padding ?? 24) / 16 + "rem";
  return (
    <div style={{ padding: pad }} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className={wide ? "text-2xl font-semibold" : "text-lg font-semibold"}>Start your free trial</h3>
          {badge ? <Badge variant="secondary">14 days</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {values.showNote === false ? "No card needed." : "Full access for 14 days. No card needed, cancel any time."}
        </p>
      </div>
      <form className={layout === "inline" ? "flex gap-2" : "flex flex-col gap-2"} onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor={id}>Work email</label>
        {plan ? <PlanPicker /> : null}
        <Input id={id} type="email" placeholder="you@company.com" aria-invalid={error || undefined} defaultValue={error ? "name@" : undefined} />
        <Button type="submit">Start trial</Button>
      </form>
      {error ? <p className="text-sm text-destructive">Enter a full email address, such as you@company.com.</p> : null}
    </div>
  );
}

const canvas: CanvasSpec = {
  name: "Trial sign-up card",
  goal: "Get a visitor to start a trial in one step, on the pricing page.",
  frames: [
    { id: "stacked", theme: "light", label: "Stacked", score: 7, why: "clear, but the button sits low",
      params: { padding: [24, 8, 48, 4], showNote: true },
      render: (v) => <TrialCard values={v} layout="stacked" /> },
    { id: "inline", theme: "light", label: "Inline field and button", width: 480, score: 8, why: "one line, fastest to finish",
      params: { padding: [24, 8, 48, 4], showNote: true },
      render: (v) => <TrialCard values={v} layout="inline" /> },
    { id: "dark", label: "Stacked, dark", theme: "dark", score: 7, why: "same as stacked, checks contrast",
      render: (v) => <TrialCard values={v} layout="stacked" /> },
    { id: "error", theme: "light", label: "Invalid email", score: 6, why: "the state the person sees most after a typo",
      render: (v) => <TrialCard values={v} layout="stacked" error /> },
    { id: "plan", theme: "light", label: "With a plan picker", score: 6, why: "one more choice before the trial",
      render: (v) => <TrialCard values={v} layout="stacked" plan /> },
    { id: "badge", theme: "light", label: "With a length badge", width: 320, score: 5, why: "badge competes with the title",
      render: (v) => <TrialCard values={v} layout="stacked" badge /> },
    { id: "wide", theme: "light", label: "Wide, for the page hero", width: 640, score: 8, why: "room for a bigger title",
      render: (v) => <TrialCard values={v} layout="inline" wide /> },
  ],
};

/** The dev route renders this. */
export default function CanvasRoute() {
  return <VariantCanvas spec={canvas} />;
}`;

const VARIANT_ROUTE_FILES = String.raw`--- Next.js App Router: app/dev/canvas/page.tsx (src/app/dev/canvas/page.tsx with a src folder) ---
import { notFound } from "next/navigation";
import CanvasRoute from "@/dev/canvas/frames";

// Development only: the canvas never ships to production.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CanvasRoute />;
}

--- Vite (React): src/main.tsx ---
// Development only: open /dev/canvas to see the variants.
if (import.meta.env.DEV && window.location.pathname === "/dev/canvas") {
  import("./dev/canvas/frames").then(({ default: CanvasRoute }) => {
    createRoot(document.getElementById("root")!).render(<CanvasRoute />);
  });
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}`;

/** Steps and files for the variant canvas, returned by get-jig-guide. */
export const VARIANT_CANVAS_MD = [
  VARIANT_CANVAS_GUIDE,
  VARIANT_CANVAS_FILE,
  VARIANT_FRAMES_FILE,
  VARIANT_ROUTE_FILES,
].join("\n\n");
