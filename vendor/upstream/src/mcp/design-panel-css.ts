// The design panel's stylesheet: Better Design's own tokens and brand font,
// the Review and Design system lists, and the workspace that shows one system
// the way the web app's project page does.
import {
  SUNGHYUN_SANS_REGULAR_WOFF2,
  SUNGHYUN_SANS_SEMIBOLD_WOFF2,
} from "./design-panel-fonts.generated";

// Better Design's brand font, embedded under its own family name so the panel
// never picks up a different local copy. Two weights: body text and labels.
const PANEL_FONTS = `
@font-face { font-family: "Better Design Sans"; font-weight: 400; font-style: normal; font-display: swap; src: url(data:font/woff2;base64,${SUNGHYUN_SANS_REGULAR_WOFF2}) format("woff2"); }
@font-face { font-family: "Better Design Sans"; font-weight: 600; font-style: normal; font-display: swap; src: url(data:font/woff2;base64,${SUNGHYUN_SANS_SEMIBOLD_WOFF2}) format("woff2"); }
`;

const BASE_CSS = `
/* Better Design's own tokens, copied from packages/web/src/app/globals.css. */
:root {
  color-scheme: light;
  --bg: oklch(0.957 0.008 85);
  --card: oklch(1 0 0);
  --fg: oklch(0.31 0.006 75);
  --muted: oklch(0.51 0.009 80);
  --line: oklch(0.895 0.01 85);
  --field: oklch(0.99 0.003 88);
  --accent: oklch(0.235 0.004 75);
  --accent-fg: oklch(0.985 0.003 90);
  --ring: oklch(0.46 0.17 248);
  --bad: oklch(0.55 0.2 32);
  --warn: oklch(0.56 0.12 65);
  --good: oklch(0.5 0.12 150);
  --radius-card: 1.5rem;
  --radius-control: 999rem;
  --shadow-card: 0 0.0625rem 0.125rem oklch(0.3 0.01 75 / 0.06), 0 0.5rem 1.5rem -0.75rem oklch(0.3 0.01 75 / 0.14);
  --font: "Better Design Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
:root.dark {
  color-scheme: dark;
  --bg: oklch(0.2 0.009 70);
  --card: oklch(0.245 0.009 70);
  --fg: oklch(0.94 0.009 85);
  --muted: oklch(0.72 0.009 82);
  --line: oklch(0.34 0.01 72);
  --field: oklch(0.27 0.009 72);
  --accent: oklch(0.94 0.012 86);
  --accent-fg: oklch(0.22 0.006 70);
  --ring: oklch(0.78 0.13 248);
  --bad: oklch(0.68 0.21 32);
  --warn: oklch(0.8 0.13 80);
  --good: oklch(0.76 0.14 150);
  --shadow-card: inset 0 0.0625rem 0 oklch(1 0 0 / 0.06), 0 0.0625rem 0.1875rem oklch(0 0 0 / 0.4);
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font); font-size: 100%; }
/* A class that sets display would otherwise keep a hidden element on screen. */
[hidden] { display: none !important; }
.bd-panel { container-type: inline-size; display: flex; flex-direction: column; min-height: 100vh; }
.bd-head { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem 1rem 0; }
.bd-panel.is-workspace .bd-head { display: none; }
.bd-title { margin: 0; font-size: 1.25rem; line-height: 1.3; font-weight: 600; }
.bd-tabs { display: flex; gap: 0.25rem; border-bottom: 0.0625rem solid var(--line); }
.bd-tab { min-height: 2.75rem; padding: 0 0.75rem; font: inherit; font-size: 0.9375rem; font-weight: 600; color: var(--muted); background: none; border: 0; border-bottom: 0.125rem solid transparent; margin-bottom: -0.0625rem; cursor: pointer; touch-action: manipulation; }
.bd-tab[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--accent); }
.bd-body { flex: 1; display: flex; flex-direction: column; gap: 1.5rem; padding: 1rem 1rem 4rem; }
.bd-body[hidden] { display: none; }
/* The list and the open workspace hold their parts for the panel's own layout, so they add no box of their own. */
.bd-list { display: contents; }
.bd-section { display: flex; flex-direction: column; gap: 0.75rem; }
.bd-h2 { margin: 0; font-size: 1rem; line-height: 1.4; font-weight: 600; }
.bd-note { margin: 0; font-size: 0.875rem; line-height: 1.5; color: var(--muted); }
.bd-card { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: var(--card); border: 0.0625rem solid var(--line); border-radius: var(--radius-card); }
.bd-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.bd-card-top .bd-verdict { white-space: nowrap; }
.bd-card-name { min-width: 0; font-size: 0.9375rem; font-weight: 600; overflow-wrap: anywhere; }
.bd-card-meta { font-size: 0.8125rem; font-weight: 400; color: var(--muted); white-space: nowrap; }
.bd-verdict { font-size: 0.8125rem; font-weight: 600; }
.bd-verdict.is-bad { color: var(--bad); }
.bd-verdict.is-good { color: var(--good); }
.bd-findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.bd-dot { flex: none; width: 0.5rem; height: 0.5rem; margin-top: 0.4375rem; border-radius: 999rem; background: var(--warn); }
.bd-dot.is-critical, .bd-dot.is-serious { background: var(--bad); }
.bd-finding { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.875rem; line-height: 1.45; }
.bd-finding-where { color: var(--muted); }
.bd-card-more { margin: 0; font-size: 0.8125rem; color: var(--muted); }
.bd-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.bd-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 2.75rem; padding: 0 1rem; font: inherit; font-size: 0.9375rem; font-weight: 600; white-space: nowrap; border-radius: var(--radius-control); cursor: pointer; touch-action: manipulation; }
.bd-btn-primary { color: var(--accent-fg); background: var(--accent); border: 0; }
.bd-btn-secondary { color: var(--fg); background: var(--card); border: 0.0625rem solid var(--line); }
.bd-btn-icon { flex: none; width: 1rem; height: 1rem; }
.bd-btn:disabled { color: var(--muted); background: var(--line); border-color: var(--line); cursor: default; }
.bd-rows { list-style: none; margin: 0; padding: 0; background: var(--card); border: 0.0625rem solid var(--line); border-radius: var(--radius-card); }
.bd-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 3.5rem; padding: 0.5rem 0.5rem 0.5rem 1rem; }
.bd-row-name { min-width: 0; font-size: 0.9375rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-proj { width: 100%; justify-content: flex-start; gap: 0.75rem; text-align: left; font: inherit; color: inherit; background: none; border: 0; border-radius: 0; padding-right: 1rem; cursor: pointer; touch-action: manipulation; }
.bd-rows li:first-child .bd-proj { border-radius: var(--radius-card) var(--radius-card) 0 0; }
.bd-rows li:last-child .bd-proj { border-radius: 0 0 var(--radius-card) var(--radius-card); }
.bd-rows li:only-child .bd-proj { border-radius: var(--radius-card); }
.bd-rows li + li .bd-proj { border-top: 0.0625rem solid var(--line); }
.bd-proj-text { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.bd-row-status { font-size: 0.8125rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-field { flex: 1; min-width: 0; min-height: 2.75rem; padding: 0 1rem; font: inherit; font-size: 0.9375rem; color: var(--fg); background: var(--field); border: 0.0625rem solid var(--line); border-radius: var(--radius-control); }
.bd-field::placeholder { color: var(--muted); }
.bd-search { width: 100%; }
/* The website's own preview cards. The page inside reports its height, so the panel scrolls, not the frame.
   A frame stays see-through only while its colour scheme matches the page inside, which is pinned to light. */
.bd-cards { display: block; width: 100%; border: 0; background: transparent; color-scheme: light; }
.bd-empty { margin: 0; padding: 1rem 0; font-size: 0.9375rem; color: var(--muted); }
.bd-link { min-height: 2.75rem; padding: 0; font: inherit; font-weight: 600; color: var(--fg); background: none; border: 0; text-decoration: underline; cursor: pointer; }
.bd-foot { position: sticky; bottom: 0; display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 1rem; background: var(--bg); border-top: 0.0625rem solid var(--line); }
.bd-foot:has(.bd-status:empty) { display: none; }
.bd-status { margin: 0; font-size: 0.8125rem; line-height: 1.45; color: var(--fg); }
.bd-status:empty { display: none; }
.bd-tab:focus-visible, .bd-btn:focus-visible, .bd-field:focus-visible, .bd-link:focus-visible, .bd-proj:focus-visible { outline: 0.125rem solid var(--ring); outline-offset: 0.125rem; }
@media (hover: hover) and (pointer: fine) {
  .bd-tab:hover { color: var(--fg); }
}
`;

// One design system: its actions and the Modify controls above the web app's
// showcase in a frame. Changes go through the host's own chat box.
const WORKSPACE_CSS = `
.bd-panel.is-workspace .bd-body#bd-systems { padding: 0; gap: 0; }
/* The bottom padding clears the chat box a host floats over the panel. */
.bd-ws { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1rem 4rem; }
.bd-ws-head { display: flex; flex-direction: column; gap: 0.5rem; }
.bd-ws-nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem 0.75rem; }
.bd-ws-title { margin: 0; font-size: 1.25rem; line-height: 1.3; font-weight: 600; }
.bd-ws-main { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; }
.bd-views { display: inline-flex; align-self: flex-start; gap: 0.25rem; padding: 0.25rem; background: var(--card); border: 0.0625rem solid var(--line); border-radius: var(--radius-control); }
.bd-view { min-height: 2.75rem; padding: 0 1rem; font: inherit; font-size: 0.875rem; font-weight: 600; color: var(--muted); background: none; border: 0; border-radius: var(--radius-control); cursor: pointer; touch-action: manipulation; }
.bd-view[aria-selected="true"] { color: var(--accent-fg); background: var(--accent); }
.bd-view:focus-visible { outline: 0.125rem solid var(--ring); outline-offset: 0.125rem; }
.bd-stage { position: relative; height: 70vh; min-height: 28rem; background: var(--card); border: 0.0625rem solid var(--line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); overflow: hidden; }
.bd-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--card); }
.bd-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; color: var(--muted); background: var(--card); }
.bd-loading[hidden] { display: none; }
@container (min-width: 60rem) {
  .bd-panel.is-workspace { height: 100vh; min-height: 0; }
  .bd-panel.is-workspace .bd-body#bd-systems { min-height: 0; }
  .bd-ws { flex: 1; min-height: 0; padding: 1rem 1.5rem 4rem; }
  .bd-ws-main { flex: 1; min-height: 0; }
  .bd-stage { flex: 1; height: auto; min-height: 0; }
}

/* Modify: the same controls as the web app's Modify panel. */
.bd-modify { display: flex; flex-direction: column; gap: 1rem; padding: 1rem; background: var(--card); border: 0.0625rem solid var(--line); border-radius: var(--radius-card); }
.bd-modify[hidden] { display: none; }
.bd-mrow { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); align-items: center; gap: 0.75rem; }
.bd-mlabel { font-size: 0.8125rem; color: var(--muted); }
.bd-colors { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.bd-color { position: relative; display: block; width: 2.75rem; height: 2.75rem; border-radius: 0.75rem; border: 0.0625rem solid var(--line); box-shadow: inset 0 0 0 0.125rem var(--card); cursor: pointer; }
.bd-color input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.bd-color:focus-within { outline: 0.125rem solid var(--ring); outline-offset: 0.125rem; }
.bd-range { display: flex; align-items: center; gap: 0.75rem; }
.bd-range output { min-width: 3.5rem; text-align: right; font-family: var(--mono); font-size: 0.8125rem; color: var(--muted); }
/* The slider is drawn from the panel's tokens; the native input lies on top
   at zero opacity, so it keeps the pointer, the keys and the slider role. */
.bd-slider { position: relative; flex: 1; min-width: 0; display: flex; align-items: center; height: 2.75rem; }
.bd-slider-track { position: relative; flex: 1; height: 0.375rem; border-radius: 999rem; background: var(--line); overflow: hidden; }
.bd-slider-fill { position: absolute; inset: 0; border-radius: inherit; background: var(--accent); transform: scaleX(var(--value, 0)); transform-origin: left; }
.bd-slider-thumb { position: absolute; left: calc(var(--value, 0) * (100% - 1.25rem)); width: 1.25rem; height: 1.25rem; border-radius: 999rem; background: var(--accent); box-shadow: 0 0 0 0.1875rem var(--card), var(--shadow-card); pointer-events: none; }
.bd-slider-input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; touch-action: pan-y; }
.bd-slider:focus-within .bd-slider-track { outline: 0.125rem solid var(--ring); outline-offset: 0.25rem; }
.bd-selects { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.bd-select-wrap { position: relative; display: flex; flex: 1 1 8rem; min-width: 0; }
.bd-select-wrap::after { content: ""; position: absolute; top: 50%; right: 1rem; width: 0.5rem; height: 0.5rem; border-right: 0.125rem solid var(--muted); border-bottom: 0.125rem solid var(--muted); transform: translateY(-70%) rotate(45deg); pointer-events: none; }
.bd-select { appearance: none; -webkit-appearance: none; flex: 1; min-width: 0; min-height: 2.75rem; padding: 0 2rem 0 0.75rem; font: inherit; font-size: 0.875rem; color: var(--fg); background: var(--field); border: 0.0625rem solid var(--line); border-radius: 0.75rem; cursor: pointer; }
.bd-select:focus-visible { outline: 0.125rem solid var(--ring); outline-offset: 0.125rem; }

.bd-toggle[aria-expanded="true"] { color: var(--accent-fg); background: var(--accent); border-color: var(--accent); }
.bd-ws-status:empty { display: none; }
.bd-ws-status { margin: 0; font-size: 0.8125rem; line-height: 1.45; color: var(--muted); }

/* Icons: the project's icon set, as the web app's Icons tab shows it. */
.bd-icons { display: flex; flex-direction: column; gap: 0.75rem; height: 100%; padding: 0.75rem; overflow-y: auto; }
.bd-icons-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.bd-icons .bd-field { flex: none; }
.bd-icons > .bd-btn { align-self: center; }
.bd-icon-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr)); gap: 0.5rem; }
.bd-icon { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; padding: 0; color: var(--fg); background: var(--bg); border: 0.0625rem solid transparent; border-radius: 0.75rem; cursor: pointer; }
.bd-icon svg { width: 1.5rem; height: 1.5rem; }
.bd-icon:focus-visible { outline: 0.125rem solid var(--ring); outline-offset: 0.125rem; }
@media (hover: hover) and (pointer: fine) {
  .bd-icon:hover { border-color: var(--line); background: var(--bg); }
  .bd-view:hover:not([aria-selected="true"]) { color: var(--fg); }
}
`;

/** The design panel's whole stylesheet, fonts first. */
export const DESIGN_PANEL_CSS = `${PANEL_FONTS}${BASE_CSS}${WORKSPACE_CSS}`;
