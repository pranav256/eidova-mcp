// get-jig-guide: teaches the CONSUMER's agent to build a "jig", a temporary
// on-page tuning panel wired to the parameters it just wrote, whenever the work
// is parameter-heavy (animation timing, springs, particles, gradients, shadow
// recipes, canvas physics). The model wires parameters well but picks final
// VALUES poorly; the person tunes by eye in seconds. Loop: agent mounts the
// jig -> person tunes -> Copy exports JSON -> person pastes it back -> agent
// hard-codes the exact values and deletes the jig. Same pattern as Josh
// Puckett's DialKit and Toolcraft, shipped here as a dependency-free scaffold.
import { z } from "zod";
import { VARIANT_CANVAS_MD } from "./variant-canvas-scaffold";
import {
  CONTEXT_ARG,
  READ_ONLY_TOOL_ANNOTATIONS,
  type RegisterToolDeps,
} from "./shared";

// The emitted files avoid template literals and ${} on purpose: they live
// inside this TS template literal, and escaped backticks are the easiest thing
// to get subtly wrong. Plain string concat keeps the scaffold copy-paste safe.
// React web gets the mature library first: DialKit (MIT) propagates value
// changes WITHOUT re-rendering the component under tuning, which is the whole
// game when the tuned surface is an animation or canvas scene. A useState-based
// scaffold re-renders the consumer on every slider drag and feels laggy there.
const JIG_DIALKIT_MD = `## React web: prefer DialKit (MIT)

For React projects that can install packages, add Josh Puckett's DialKit instead of hand-rolling the panel. It updates values without re-rendering the component being tuned (no laggy sliders on heavy scenes) and adds a spring-curve editor and an animation timeline, which matter for exactly the animation work jigs are for. Install it with the project's own package manager:

\`\`\`bash
npm install dialkit motion
# bun add dialkit motion   pnpm add dialkit motion   yarn add dialkit motion
\`\`\`

Mount \`<DialRoot />\` once (for example in the root layout), then wire parameters where you build the tuned surface:

\`\`\`tsx
import { useDialKit } from "dialkit";

const p = useDialKit("Hero animation", {
  duration: [0.4, 0, 2],
  bounce: [0.2, 0, 1],
  stagger: [0.05, 0, 0.3],
});
\`\`\`

Same loop as below: the user tunes, exports values with the panel's Copy button, pastes them back to you, and you hard-code them and remove the DialKit usage.

If npm installs are not possible in this project, fall back to the dependency-free scaffold below. Its values are React state, so the tuned component re-renders per change: fine for colors, radius, and layout values; for a heavy canvas or animation loop, prefer DialKit or the vanilla jig.

`;

const JIG_REACT_FILE = `--- src/dev/use-jig.tsx ---
// TEMPORARY tuning jig. Mount while iterating on parameter-heavy UI, let the
// person tune by eye, click "Copy values", paste the JSON back to your agent,
// hard-code the final values, then DELETE this file and its usage.
import { type CSSProperties, type ReactNode, useState } from "react";

// number: [default, min, max, step?] renders a slider.
// boolean renders a toggle. string renders a text input.
// { options, default } renders a select.
type SliderSpec = [number, number, number] | [number, number, number, number];
type SelectSpec = { options: string[]; default?: string };
export type JigSpec = Record<string, SliderSpec | SelectSpec | boolean | string>;
export type JigValues = Record<string, number | boolean | string>;

function defaultsOf(spec: JigSpec): JigValues {
  const out: JigValues = {};
  for (const [key, def] of Object.entries(spec)) {
    if (Array.isArray(def)) out[key] = def[0];
    else if (typeof def === "object") out[key] = def.default ?? def.options[0];
    else out[key] = def;
  }
  return out;
}

const panelStyle: CSSProperties = {
  position: "fixed", right: 16, bottom: 16, zIndex: 99999, width: 280,
  background: "oklch(0.22 0.01 260 / 0.94)", color: "oklch(0.95 0 0)",
  border: "1px solid oklch(1 0 0 / 0.12)", borderRadius: 12,
  padding: "10px 12px", font: "12px/1.5 ui-monospace, monospace",
  boxShadow: "0 8px 24px oklch(0 0 0 / 0.35)",
};
const rowStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, margin: "6px 0",
};
const labelStyle: CSSProperties = { flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const buttonStyle: CSSProperties = {
  font: "inherit", cursor: "pointer", borderRadius: 6, padding: "2px 8px",
  background: "oklch(1 0 0 / 0.1)", color: "inherit", border: "1px solid oklch(1 0 0 / 0.15)",
};

/**
 * const [p, jig] = useJig("Hero animation", { duration: [0.4, 0, 2, 0.05], bounce: [0.2, 0, 1, 0.01] });
 * ...use p.duration / p.bounce in the code being tuned, and render {jig} anywhere.
 */
export function useJig(name: string, spec: JigSpec): [JigValues, ReactNode] {
  const storageKey = "bd-jig:" + name;
  // Captured once on mount: pass a static spec literal, not a changing object.
  const [base] = useState(() => defaultsOf(spec));
  const [values, setValues] = useState<JigValues>(() => {
    try { return { ...base, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }; }
    catch { return base; }
  });
  const [open, setOpen] = useState(true);

  const set = (key: string, value: number | boolean | string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const control = (key: string, def: JigSpec[string]) => {
    if (Array.isArray(def)) {
      const [, min, max, step] = def;
      return (
        <div style={rowStyle} key={key}>
          <span style={labelStyle}>{key}</span>
          <input type="range" min={min} max={max} step={step ?? (max - min) / 100}
            value={Number(values[key])} style={{ width: 110 }}
            onChange={(e) => set(key, Number(e.target.value))} />
          <span style={{ width: 44, textAlign: "right" }}>{Number(values[key]).toFixed(2).replace(/\\.?0+$/, "")}</span>
        </div>
      );
    }
    if (typeof def === "object") {
      return (
        <div style={rowStyle} key={key}>
          <span style={labelStyle}>{key}</span>
          <select value={String(values[key])} style={{ ...buttonStyle, cursor: "pointer" }}
            onChange={(e) => set(key, e.target.value)}>
            {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (typeof def === "boolean") {
      return (
        <div style={rowStyle} key={key}>
          <span style={labelStyle}>{key}</span>
          <input type="checkbox" checked={Boolean(values[key])}
            onChange={(e) => set(key, e.target.checked)} />
        </div>
      );
    }
    return (
      <div style={rowStyle} key={key}>
        <span style={labelStyle}>{key}</span>
        <input type="text" value={String(values[key])} style={{ ...buttonStyle, width: 120, cursor: "text" }}
          onChange={(e) => set(key, e.target.value)} />
      </div>
    );
  };

  const jig = (
    <div style={panelStyle}>
      <div style={{ ...rowStyle, margin: 0 }}>
        <strong style={labelStyle}>{name}</strong>
        <button style={buttonStyle} type="button"
          onClick={(event) => {
            const button = event.currentTarget;
            navigator.clipboard.writeText(JSON.stringify(values, null, 2)).then(
              () => { button.textContent = "Copied"; },
              () => { button.textContent = "Copy failed"; },
            );
            setTimeout(() => { button.textContent = "Copy values"; }, 1500);
          }}>
          Copy values
        </button>
        <button style={buttonStyle} type="button" onClick={() => { setValues(base); try { localStorage.removeItem(storageKey); } catch {} }}>
          Reset
        </button>
        <button style={buttonStyle} type="button" onClick={() => setOpen(!open)}>{open ? "–" : "+"}</button>
      </div>
      {open ? Object.entries(spec).map(([key, def]) => control(key, def)) : null}
    </div>
  );

  return [values, jig];
}`;

const JIG_VANILLA_FILE = `--- jig.js ---
// TEMPORARY tuning jig (framework-free). createJig returns a live values
// object; read it inside your render/animation loop. Person tunes, clicks
// "Copy values", pastes the JSON back to the agent; then DELETE this file.

/**
 * Mount a tuning panel and return a LIVE values object, so an animation or
 * canvas loop reads the current numbers without re-rendering anything.
 *
 *   var jig = createJig("Particles", { count: [120, 0, 500, 1], speed: [1, 0, 4] });
 *   ...then read jig.values.count inside your draw loop.
 *
 * name      panel title, and the part after "bd-jig:" in the localStorage key
 *           that persists the tuning.
 * spec      [default, min, max, step?] for a slider, boolean for a toggle,
 *           { options, default } for a select, string for a text input.
 * onChange  optional, called with the values object after every edit.
 * Returns { values, destroy }. Call destroy() to remove the panel.
 */
export function createJig(name, spec, onChange) {
  var storageKey = "bd-jig:" + name;
  var values = {};
  Object.keys(spec).forEach(function (key) {
    var def = spec[key];
    values[key] = Array.isArray(def) ? def[0]
      : (def && typeof def === "object") ? (def.default != null ? def.default : def.options[0])
      : def;
  });
  try { Object.assign(values, JSON.parse(localStorage.getItem(storageKey) || "{}")); } catch (e) {}

  var panel = document.createElement("div");
  panel.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;width:280px;" +
    "background:oklch(0.22 0.01 260 / 0.94);color:oklch(0.95 0 0);border:1px solid oklch(1 0 0 / 0.12);" +
    "border-radius:12px;padding:10px 12px;font:12px/1.5 ui-monospace,monospace;box-shadow:0 8px 24px oklch(0 0 0 / 0.35)";

  function commit(key, value) {
    values[key] = value;
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch (e) {}
    if (onChange) onChange(values);
  }

  function row(key, def) {
    var line = document.createElement("div");
    line.style.cssText = "display:flex;align-items:center;gap:8px;margin:6px 0";
    var label = document.createElement("span");
    label.textContent = key;
    label.style.cssText = "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    line.appendChild(label);
    var input;
    if (Array.isArray(def)) {
      input = document.createElement("input");
      input.type = "range"; input.min = def[1]; input.max = def[2];
      input.step = def[3] != null ? def[3] : (def[2] - def[1]) / 100;
      input.value = values[key]; input.style.width = "110px";
      var readout = document.createElement("span");
      readout.style.cssText = "width:44px;text-align:right";
      readout.textContent = values[key];
      input.oninput = function () { commit(key, Number(input.value)); readout.textContent = input.value; };
      line.appendChild(input); line.appendChild(readout);
    } else if (def && typeof def === "object") {
      input = document.createElement("select");
      def.options.forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o; opt.textContent = o; input.appendChild(opt);
      });
      input.value = values[key];
      input.onchange = function () { commit(key, input.value); };
      line.appendChild(input);
    } else if (typeof def === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox"; input.checked = !!values[key];
      input.onchange = function () { commit(key, input.checked); };
      line.appendChild(input);
    } else {
      input = document.createElement("input");
      input.type = "text"; input.value = values[key]; input.style.width = "120px";
      input.oninput = function () { commit(key, input.value); };
      line.appendChild(input);
    }
    return line;
  }

  var head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:8px";
  var title = document.createElement("strong");
  title.textContent = name; title.style.flex = "1";
  var copy = document.createElement("button");
  copy.textContent = "Copy values"; copy.type = "button";
  copy.onclick = function () {
    navigator.clipboard.writeText(JSON.stringify(values, null, 2)).then(
      function () { copy.textContent = "Copied"; },
      function () { copy.textContent = "Copy failed"; },
    );
    setTimeout(function () { copy.textContent = "Copy values"; }, 1500);
  };
  head.appendChild(title); head.appendChild(copy);
  panel.appendChild(head);
  Object.keys(spec).forEach(function (key) { panel.appendChild(row(key, spec[key])); });
  document.body.appendChild(panel);

  return { values: values, destroy: function () { panel.remove(); } };
}`;

// React Native: no DOM, no localStorage, no core Slider. Steppers + Switch +
// TextInput from RN core keep it dependency-free; values export through Share.
const JIG_RN_FILE = `--- src/dev/use-jig.native.tsx ---
// TEMPORARY tuning jig for React Native. Mount while iterating, let the person
// tune, tap "Share values", paste the JSON back to your agent, hard-code the
// final values, then DELETE this file and its usage.
import { type ReactNode, useState } from "react";
import { Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";

// number: [default, min, max, step?] renders a - / + stepper.
// boolean renders a Switch. string renders a TextInput.
// { options, default } renders a value cycler.
type StepperSpec = [number, number, number] | [number, number, number, number];
type SelectSpec = { options: string[]; default?: string };
export type JigSpec = Record<string, StepperSpec | SelectSpec | boolean | string>;
export type JigValues = Record<string, number | boolean | string>;

function defaultsOf(spec: JigSpec): JigValues {
  const out: JigValues = {};
  for (const [key, def] of Object.entries(spec)) {
    if (Array.isArray(def)) out[key] = def[0];
    else if (typeof def === "object") out[key] = def.default ?? def.options[0];
    else out[key] = def;
  }
  return out;
}

const s = StyleSheet.create({
  panel: {
    position: "absolute", right: 12, bottom: 24, zIndex: 9999, width: 260,
    backgroundColor: "rgba(24, 24, 28, 0.94)", borderRadius: 12, padding: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  label: { flex: 1, color: "white", fontSize: 12 },
  value: { color: "white", fontSize: 12, minWidth: 44, textAlign: "right" },
  btn: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  btnText: { color: "white", fontSize: 12 },
  input: {
    color: "white", fontSize: 12, borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 2, backgroundColor: "rgba(255,255,255,0.12)", minWidth: 100,
  },
});

/**
 * const [p, jig] = useJig("Hero animation", { duration: [0.4, 0, 2, 0.05] });
 * ...use p.duration in the code being tuned, render {jig} last in the screen.
 * Note: values are React state, so the tuned component re-renders per change.
 * For Reanimated worklets, feed values into shared values via useEffect.
 */
export function useJig(name: string, spec: JigSpec): [JigValues, ReactNode] {
  const [base] = useState(() => defaultsOf(spec));
  const [values, setValues] = useState<JigValues>(base);
  const set = (key: string, value: number | boolean | string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const control = (key: string, def: JigSpec[string]) => {
    if (Array.isArray(def)) {
      const [, min, max, step] = def;
      const delta = step ?? (max - min) / 20;
      const current = Number(values[key]);
      const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
      return (
        <View style={s.row} key={key}>
          <Text style={s.label}>{key}</Text>
          <Pressable style={s.btn} onPress={() => set(key, clamp(current - delta))}>
            <Text style={s.btnText}>-</Text>
          </Pressable>
          <Pressable style={s.btn} onPress={() => set(key, clamp(current + delta))}>
            <Text style={s.btnText}>+</Text>
          </Pressable>
          <Text style={s.value}>{String(values[key])}</Text>
        </View>
      );
    }
    if (typeof def === "object") {
      const idx = def.options.indexOf(String(values[key]));
      return (
        <View style={s.row} key={key}>
          <Text style={s.label}>{key}</Text>
          <Pressable style={s.btn} onPress={() => set(key, def.options[(idx + 1) % def.options.length])}>
            <Text style={s.btnText}>{String(values[key])}</Text>
          </Pressable>
        </View>
      );
    }
    if (typeof def === "boolean") {
      return (
        <View style={s.row} key={key}>
          <Text style={s.label}>{key}</Text>
          <Switch value={Boolean(values[key])} onValueChange={(v) => set(key, v)} />
        </View>
      );
    }
    return (
      <View style={s.row} key={key}>
        <Text style={s.label}>{key}</Text>
        <TextInput style={s.input} value={String(values[key])} onChangeText={(t) => set(key, t)} />
      </View>
    );
  };

  const jig = (
    <View style={s.panel}>
      <View style={s.row}>
        <Text style={[s.label, { fontWeight: "700" }]}>{name}</Text>
        <Pressable style={s.btn} onPress={() => Share.share({ message: JSON.stringify(values, null, 2) })}>
          <Text style={s.btnText}>Share values</Text>
        </Pressable>
        <Pressable style={s.btn} onPress={() => setValues(base)}>
          <Text style={s.btnText}>Reset</Text>
        </Pressable>
      </View>
      {Object.entries(spec).map(([key, def]) => control(key, def))}
    </View>
  );

  return [values, jig];
}`;

const JIG_GUIDE_MD = `# Build a tuning jig for this work

You are generating parameter-heavy UI. Models wire parameters well but pick final VALUES poorly: animation durations, spring bounce, stagger offsets, particle counts, blur radii, gradient stops, shadow recipes are taste calls the person should make by eye, not numbers to guess.

So do what a woodworker does: build a jig. Mount a small on-page control panel wired to the exact variables you just wrote, and hand tuning to the person.

## The loop

1. Extract the tunable values into one params object instead of scattering literals.
2. Write the jig file below into the project and wire the params through it.
3. Tell the person: tune the panel until it feels right, then click "Copy values" and paste the JSON back here.
4. When the JSON comes back, hard-code those EXACT values, delete the jig file and its usage, and confirm what you locked in.

The jig persists tuned values in localStorage (key "bd-jig:<name>"), so a page reload or dev-server restart does not lose the person's tuning. Never ship the jig: it is scaffolding, not product UI.

## When to reach for this

Any time you are about to pick a magic number you cannot defend: animation timing and easing, springs, stagger, parallax and scroll speeds, particle systems, canvas physics, glow/blur/grain intensity, gradient angles and stops, shadow stacks, border-radius experiments. One jig per surface being tuned; 3 to 12 controls is the sweet spot.

For DESIGN-TOKEN tuning on a Better Design project (brand colors, radius, fonts), use get-design-config / set-design-config instead: those persist to the project itself.

If the person has not chosen a direction yet and wants to SEE options (several layouts, states, sizes or themes of one component or screen), call this tool again with kind "variant-canvas": it lays the variants side by side on a canvas inside their app.

If the person wants a reusable TOOL rather than a tuned component (a generator, an image effect, a shader playground), call this tool again with kind "standalone-tool": it returns the Toolcraft starter kit, which already has the canvas and the export flow, plus optional layers and a timeline.
`;

// The second shape of jig: not a panel bolted onto the UI being built, but a
// separate purpose-built tool the person keeps and reuses. Toolcraft (MIT)
// scaffolds that whole app, so an agent asked for a generator or a shader toy
// starts from a working canvas, layer system and export flow instead of
// inventing them. The command, the MIT license, the package-manager behaviour
// and the skills install are checked against the published @pixel-point/toolcraft
// README; claims that source does not make are left out on purpose.
const JIG_TOOLCRAFT_MD = `# Build a custom design tool

The person wants a TOOL, not a tuned component: something they open, play with, and reuse. Examples: a procedural graphics generator, an image effect (ASCII, halftone, glitch), a shader playground, an animation or asset generator.

Do not hand-build the app shell. Scaffold it with Toolcraft, an open-source (MIT) starter kit for AI-built design apps from Pixel Point.

Show the command and get the person's go-ahead before you run it. It downloads a third-party package, writes a new project, installs dependencies, and then installs external workflow skills through the \`skills\` CLI, which writes to the person's agent config and not only to the new project. Add \`--no-skills\` to skip that last step.

Always pass a project name. Without one the CLI scaffolds into the current directory, which is the project you are already working in. Run it from the parent directory of where the tool should live. Both \`--yes\` flags matter: the first one goes to npx, which otherwise prompts before it installs the package, and the second goes to Toolcraft, whose own prompts need a terminal you do not have.

\`\`\`bash
npx --yes @pixel-point/toolcraft create my-tool --yes
# pnpm dlx @pixel-point/toolcraft create my-tool --yes
\`\`\`

Use npm or pnpm. Toolcraft reads which of those two launched it and generates matching setup commands. Any other package manager is unsupported and needs \`--no-install\` plus a manual install, and a template's own lockfile or declared package manager wins over the launcher either way.

Then build the tool's actual behavior inside the generated project and run it with the dev script the CLI prints.

## What the starter already gives you

- A working canvas with a toolbar and panel layout, plus an export flow.
- Ready-made creative controls: sliders, range sliders, curves, color palette, gradient editor, font picker, vector controls.
- Optional layers, an animation timeline and keyframes.
- Embedded AI skills, performance instructions and visual-testing rules, so generated code stays consistent.

Because the architecture exists, spend your effort on the tool's idea: the algorithm, the parameters worth exposing, and the defaults that make the first render look good.

## Do not use this for

Tuning values inside an app you are already building. That is a control panel, not a new app: call get-jig-guide with kind "tune-in-place" and mount a jig in the existing UI.
`;

/**
 * Registers the jig guide, which returns a throwaway control panel for tuning
 * one effect's parameters by eye, or a canvas of variants to compare and pick.
 * It is deliberately separate from the design config tools: a jig tunes a
 * single component and is thrown away, while a design config persists to the
 * project.
 */
export function registerJigTools({ server, tracked }: RegisterToolDeps): void {
  server.registerTool(
    "get-jig-guide",
    {
      title: "Get a Jig for Parameter Work",
      description: `Return the setup for a "jig", the tool you build to make the real thing precisely. Three kinds, all here. Use kind "tune-in-place" (default) when you are about to hard-code taste-based values in UI you are building: animation duration/easing/springs/stagger, particles, canvas physics, blur/glow/grain, gradient stops, shadow recipes, parallax speeds. It returns a control panel to wire to those parameters so the USER tunes by eye and you hard-code what they copy back. Use kind "standalone-tool" when the user wants a reusable custom tool instead: a generator, an image effect, a shader playground, an asset maker. That returns the Toolcraft starter kit (MIT), which ships a canvas and an export flow, with optional layers and a timeline. Use kind "variant-canvas" when the user should compare several versions of one component or screen before one is built: it returns a pan-and-zoom canvas you add as a development-only route in their React app (Next.js or Vite), with one frame per variant built from their real components, a self-score per frame, per-frame tuning, side-by-side compare, and keep-with-a-note; the user copies their picks back as JSON. Tuning setups: React recommends DialKit (MIT, no re-render lag) with a dependency-free fallback; "vanilla" and "react-native" get dependency-free scaffolds.`,
      inputSchema: z.object({
        kind: z
          .enum(["tune-in-place", "standalone-tool", "variant-canvas"])
          .default("tune-in-place")
          .describe("What the user needs. 'tune-in-place' (default): a control panel for parameters in the UI you are building. 'standalone-tool': a separate reusable design tool, scaffolded with Toolcraft. 'variant-canvas': several variants of one component or screen side by side, for the user to compare and pick."),
        framework: z
          .enum(["react", "vanilla", "react-native"])
          .optional()
          .describe("Which tune-in-place setup to return. 'react' (default) for React/Next web projects; 'vanilla' for plain DOM or canvas work; 'react-native' for RN/Expo apps. Ignored when kind is 'standalone-tool' or 'variant-canvas'."),
        context: CONTEXT_ARG,
      }),
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async ({ kind, framework, context }) => {
      // framework only describes a tune-in-place setup, so leave it out of the
      // other kinds rather than recording a default nobody chose.
      const trackedArgs =
        kind === "tune-in-place"
          ? { kind, context, framework: framework ?? "react" }
          : { kind, context };
      return tracked("get-jig-guide", trackedArgs, async () => {
        if (kind === "standalone-tool") {
          return { content: [{ type: "text" as const, text: JIG_TOOLCRAFT_MD }] };
        }
        if (kind === "variant-canvas") {
          return { content: [{ type: "text" as const, text: VARIANT_CANVAS_MD }] };
        }
        const body =
          framework === "vanilla"
            ? JIG_VANILLA_FILE
            : framework === "react-native"
              ? JIG_RN_FILE
              : `${JIG_DIALKIT_MD}\n${JIG_REACT_FILE}`;
        return {
          content: [{ type: "text" as const, text: `${JIG_GUIDE_MD}\n${body}` }],
        };
      });
    },
  );
}
