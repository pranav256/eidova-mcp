// The design panel's workspace: one design system, shown the way the web app's
// project page shows it. The Design system view frames the web app's own
// showcase page, so the panel and the website draw the same components. The
// Modify controls save through set-design-config, and the Icons view reads the
// project's icon set. A change the person types goes in the host's own chat
// box: the panel tells the model which system is open, and shows the new
// version when the agent finishes.
//
// Plain ES5, pasted into the panel script's function scope. It reads and sets
// that script's ws, and reads these names from it and from nowhere else:
// bdApp, setStatus, el, button, send, tellChat, callTool, callPanel, resultOf,
// systemById, projectById, replaceProject and renderSystems. The panel script
// calls only openWorkspace, closeWorkspace and renderWorkspace from here. The
// runtime test in design-panel-runtime.test.ts clicks through both sides.
import {
  DESIGN_FONTS,
  ICON_LIBRARY_OPTIONS,
  MODIFY_COLOR_KEYS,
  RADIUS_RANGE,
} from "../design-config-options";
import { APP_BASE_URL } from "./tools/shared";

const CONSTANTS = `
  var APP = ${JSON.stringify(APP_BASE_URL)};
  var FONTS = ${JSON.stringify(DESIGN_FONTS)};
  var ICON_LIBS = ${JSON.stringify(ICON_LIBRARY_OPTIONS)};
  var RADIUS = ${JSON.stringify(RADIUS_RANGE)};
  var COLOR_KEYS = ${JSON.stringify(MODIFY_COLOR_KEYS)};
`;

const WORKSPACE_JS = String.raw`
  var COLOR_LABELS = { primary: "Primary", secondary: "Secondary", accent: "Accent", background: "Background", foreground: "Foreground", destructive: "Destructive" };
  var ICON_PAGE = 120;
  // One check per return to the panel, and no more than one in this window,
  // so moving between the chat and the panel cannot run up tool calls.
  var CHECK_GAP = 15000;

  function openExternal(url) {
    if (bdApp && bdApp.openLink) { Promise.resolve(bdApp.openLink({ url: url })).catch(function () { window.open(url, "_blank", "noopener"); }); return; }
    if (window.openai && window.openai.openExternal) { window.openai.openExternal({ href: url }); return; }
    window.open(url, "_blank", "noopener");
  }

  function textOf(res) {
    var content = res && (res.content || (res.result && res.result.content));
    return content && content[0] && content[0].text ? String(content[0].text) : "";
  }

  function failed(res) {
    return !res || res.isError || /^(Could not|Network error)/.test(textOf(res));
  }

  // ---- Colors: the native picker speaks hex, the project speaks oklch ----
  var probe = null;
  function toHex(css) {
    try {
      if (!probe) { probe = document.createElement("canvas"); probe.width = 1; probe.height = 1; }
      var ctx = probe.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      var hex = "#";
      for (var i = 0; i < 3; i++) hex += ("0" + d[i].toString(16)).slice(-2);
      return hex;
    } catch (e) { return "#000000"; }
  }

  function round(n, places) { var f = Math.pow(10, places); return Math.round(n * f) / f; }

  function toOklch(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (var i = 0; i < 3; i++) { var v = c[i] / 255; c[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    var l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    var m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    var s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var C = Math.sqrt(A * A + B * B);
    var H = C < 0.0002 ? 0 : (Math.atan2(B, A) * 180 / Math.PI + 360) % 360;
    return "oklch(" + round(L, 4) + " " + round(C, 4) + " " + round(H, 2) + ")";
  }

  function remOf(radius) {
    var m = /^([\d.]+)(rem|px)?$/.exec(String(radius || "").trim());
    if (!m) return 0.5;
    return m[2] === "px" ? parseFloat(m[1]) / 16 : parseFloat(m[1]);
  }

  // ---- Saving a Modify change ----
  // The tool's own text is written for the model, so the person gets a plain reason.
  function saveFailure(res) {
    if (/HTTP 40[134]|not yours|not found/i.test(textOf(res))) return "The change did not save: this chat is not signed in to the account that owns this system.";
    return "The change did not save. Try again, or ask for it in the chat.";
  }

  function mergeConfig(a, b) {
    var out = {};
    var k;
    for (k in a) out[k] = a[k];
    for (k in b) {
      if (b[k] && typeof b[k] === "object" && out[k] && typeof out[k] === "object") {
        var inner = {};
        var j;
        for (j in out[k]) inner[j] = out[k][j];
        for (j in b[k]) inner[j] = b[k][j];
        out[k] = inner;
      } else out[k] = b[k];
    }
    return out;
  }

  function saveConfig(project, patch) {
    ws.pending = mergeConfig(ws.pending || {}, patch);
    if (ws.saveTimer) clearTimeout(ws.saveTimer);
    setStatus("Saving…");
    var session = ws;
    ws.saveTimer = setTimeout(function () {
      var config = session.pending;
      session.pending = null;
      var call = callTool("set-design-config", { projectId: project.id, config: config });
      if (!call) {
        send("Set these exact values on my Better Design design system “" + project.title + "” (project id: " + project.id + ") with set-design-config: " + JSON.stringify(config), "The change");
        return;
      }
      Promise.resolve(call).then(function (res) {
        if (ws !== session) return;
        if (failed(res)) { setStatus(saveFailure(res)); return; }
        reloadShowcase();
        setStatus("Saved. The preview shows it.");
      }, function () {
        if (ws === session) setStatus("The change did not save. Try again, or ask for it in the chat.");
      });
    }, 500);
  }

  // ---- Showing the version a chat request makes ----
  // The person types the change in the host's chat box, then comes back to
  // the panel. One project read on that return shows the new version.
  function checkForNewVersion() {
    if (!ws || ws.kind !== "project") return;
    var now = Date.now();
    if (ws.checkedAt && now - ws.checkedAt < CHECK_GAP) return;
    var project = projectById(ws.id);
    // A project still generating is checked too, so the finished version shows.
    if (!project) return;
    ws.checkedAt = now;
    var before = project.fragmentId;
    var session = ws;
    var call = callPanel({ project: project.id });
    if (!call) return;
    Promise.resolve(call).then(function (res) {
      var sc = resultOf(res);
      var next = sc && sc.project;
      if (!next || ws !== session) return;
      replaceProject(next);
      if (next.fragmentId && next.fragmentId !== before) {
        session.modifyFor = null;
        showView(session.view);
        renderModify();
        setStatus("Updated with your change.");
      } else if (next.status === "generating") setStatus("The agent is making your change. It shows here when you come back.");
    }, function () {});
  }

  window.addEventListener("focus", checkForNewVersion);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) checkForNewVersion(); });

  // ---- The Design system view: the web app's own showcase page ----
  function showcaseUrl() {
    if (ws.kind === "system") return APP + "/design-systems/" + encodeURIComponent(ws.id) + "?embed=1";
    var project = projectById(ws.id);
    if (!project || !project.fragmentId) return null;
    return APP + "/preview/" + encodeURIComponent(project.fragmentId) + "?v=" + ws.version;
  }

  function reloadShowcase() {
    ws.version++;
    if (ws.view === "showcase") showView("showcase");
  }

  function renderShowcase(stage) {
    var url = showcaseUrl();
    if (!url) {
      stage.appendChild(el("p", "bd-loading", "The preview appears when generation finishes."));
      return;
    }
    var loading = el("p", "bd-loading", "Loading the showcase…");
    var frame = el("iframe", "bd-frame");
    frame.title = "Showcase of " + ws.name;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.addEventListener("load", function () { loading.hidden = true; });
    frame.src = url;
    stage.appendChild(frame);
    stage.appendChild(loading);
  }

  function copyText(text, label) {
    var ok = function () { setStatus(label + " copied."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { setStatus("This panel cannot copy here. Select the text instead."); });
    } else setStatus("This panel cannot copy here. Select the text instead.");
  }

  // ---- The Icons view ----
  var SVG_TAGS = { path: 1, circle: 1, rect: 1, g: 1, line: 1, polyline: 1, polygon: 1, ellipse: 1, defs: 1, clipPath: 1, mask: 1 };

  // The icon files are our own, but only plain shapes reach the page.
  function cleanSvg(node) {
    for (var i = node.children.length - 1; i >= 0; i--) {
      var child = node.children[i];
      if (!SVG_TAGS[child.nodeName]) { node.removeChild(child); continue; }
      cleanSvg(child);
    }
    for (var a = node.attributes.length - 1; a >= 0; a--) {
      var attr = node.attributes[a].name;
      if (/^on/i.test(attr) || /href/i.test(attr)) node.removeAttribute(attr);
    }
  }

  function svgOf(icon, pack) {
    var w = icon.width || pack.width || 24;
    var h = icon.height || pack.height || 24;
    var doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '">' + icon.body + "</svg>", "image/svg+xml");
    var root = doc.documentElement;
    if (!root || root.nodeName !== "svg") return null;
    cleanSvg(root);
    root.setAttribute("aria-hidden", "true");
    return document.importNode(root, true);
  }

  function renderIcons(stage) {
    var session = ws;
    var project = projectById(session.id);
    var box = el("div", "bd-icons");
    stage.appendChild(box);
    if (!project || !project.iconPack) { box.appendChild(el("p", "bd-note", "This system has no icon set yet.")); return; }
    var head = el("div", "bd-icons-head");
    var title = el("span", "bd-h2", project.values.iconLibrary || "Icons");
    head.appendChild(title);
    box.appendChild(head);
    var filter = el("input", "bd-field");
    filter.type = "search";
    filter.placeholder = "Search icons";
    filter.setAttribute("aria-label", "Search icons");
    box.appendChild(filter);
    var grid = el("ul", "bd-icon-grid");
    grid.setAttribute("aria-label", "Icons");
    box.appendChild(grid);
    var more = button("bd-btn-secondary", "Show more", function () { session.iconShown += ICON_PAGE; draw(); });
    more.hidden = true;
    box.appendChild(more);
    var note = el("p", "bd-note", "Loading the icons…");
    box.appendChild(note);
    session.iconShown = ICON_PAGE;

    function draw() {
      grid.textContent = "";
      var pack = session.iconPack;
      var q = filter.value.trim().toLowerCase();
      var names = Object.keys(pack.icons).filter(function (n) { return !q || n.indexOf(q) !== -1; });
      title.textContent = (project.values.iconLibrary || "Icons") + " · " + names.length + " icons";
      for (var i = 0; i < names.length && i < session.iconShown; i++) {
        (function (n) {
          var svg = svgOf(pack.icons[n], pack);
          if (!svg) return;
          var li = el("li");
          var b = el("button", "bd-icon");
          b.type = "button";
          b.title = n;
          b.setAttribute("aria-label", n);
          b.appendChild(svg);
          b.addEventListener("click", function () { copyText(n, "The icon name " + n); });
          li.appendChild(b);
          grid.appendChild(li);
        })(names[i]);
      }
      more.hidden = names.length <= session.iconShown;
      note.textContent = names.length ? "" : "No icon matches “" + filter.value + "”.";
    }

    filter.addEventListener("input", function () { session.iconShown = ICON_PAGE; draw(); });
    if (session.iconPack) { draw(); return; }
    fetch(APP + project.iconPack).then(function (r) {
      if (!r.ok) throw new Error("missing");
      return r.json();
    }).then(function (pack) {
      if (ws !== session) return;
      if (!pack || !pack.icons) throw new Error("empty");
      session.iconPack = pack;
      draw();
    }).catch(function () {
      if (ws === session) note.textContent = "This icon set cannot be browsed here. Open the system on Better Design to see it.";
    });
  }

  // ---- Views ----
  var VIEWS = [
    { id: "showcase", label: "Design system", draw: renderShowcase },
    { id: "icons", label: "Icons", draw: renderIcons },
  ];

  function showView(id) {
    ws.view = id;
    for (var i = 0; i < ws.viewTabs.length; i++) {
      var on = ws.viewTabs[i].getAttribute("data-view") === id;
      ws.viewTabs[i].setAttribute("aria-selected", String(on));
      ws.viewTabs[i].tabIndex = on ? 0 : -1;
    }
    ws.stage.textContent = "";
    for (var v = 0; v < VIEWS.length; v++) if (VIEWS[v].id === id) VIEWS[v].draw(ws.stage);
  }

  function viewTabs() {
    var bar = el("div", "bd-views");
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Views");
    var shown = VIEWS;
    for (var i = 0; i < shown.length; i++) {
      (function (view) {
        var b = el("button", "bd-view", view.label);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("data-view", view.id);
        b.addEventListener("click", function () { showView(view.id); });
        b.addEventListener("keydown", function (e) {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          var at = 0;
          for (var k = 0; k < shown.length; k++) if (shown[k].id === ws.view) at = k;
          var next = shown[(at + (e.key === "ArrowRight" ? 1 : shown.length - 1)) % shown.length];
          showView(next.id);
          for (var t = 0; t < ws.viewTabs.length; t++) if (ws.viewTabs[t].getAttribute("data-view") === next.id) ws.viewTabs[t].focus();
        });
        ws.viewTabs.push(b);
        bar.appendChild(b);
      })(shown[i]);
    }
    return bar;
  }

  // ---- Modify: the web app's Modify panel ----
  function option(label, value) {
    var o = document.createElement("option");
    o.textContent = label;
    o.value = value;
    return o;
  }

  function select(label, options, value, onChange) {
    var s = el("select", "bd-select");
    s.setAttribute("aria-label", label);
    var found = false;
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (o.group) {
        var g = document.createElement("optgroup");
        g.label = o.group;
        for (var j = 0; j < o.items.length; j++) {
          g.appendChild(option(o.items[j].label, o.items[j].value));
          if (o.items[j].value === value) found = true;
        }
        s.appendChild(g);
      } else {
        s.appendChild(option(o.label, o.value));
        if (o.value === value) found = true;
      }
    }
    if (value && !found) s.insertBefore(option(value, value), s.firstChild);
    if (!value) s.insertBefore(option(label, ""), s.firstChild);
    s.value = value || "";
    s.addEventListener("change", function () { if (s.value) onChange(s.value); });
    var wrap = el("span", "bd-select-wrap");
    wrap.appendChild(s);
    return wrap;
  }

  function fontGroups(filter) {
    var groups = {};
    var order = [];
    for (var i = 0; i < FONTS.length; i++) {
      var f = FONTS[i];
      if (!filter(f)) continue;
      if (!groups[f.category]) { groups[f.category] = []; order.push(f.category); }
      groups[f.category].push(f);
    }
    var NAMES = { "sans-serif": "Sans serif", serif: "Serif", monospace: "Monospace", display: "Display" };
    return order.map(function (c) { return { group: NAMES[c] || c, items: groups[c] }; });
  }

  function mrow(label, control) {
    var row = el("div", "bd-mrow");
    row.appendChild(el("span", "bd-mlabel", label));
    row.appendChild(control);
    return row;
  }

  function renderModify() {
    var project = projectById(ws.id);
    var box = ws.modifyEl;
    if (!project || !box) return;
    ws.modifyFor = project.fragmentId;
    box.textContent = "";
    var values = project.values;
    var colors = el("div", "bd-colors");
    for (var i = 0; i < COLOR_KEYS.length; i++) {
      (function (key) {
        var swatch = el("label", "bd-color");
        swatch.style.background = values[key] || "transparent";
        swatch.title = COLOR_LABELS[key];
        var input = el("input");
        input.type = "color";
        input.value = toHex(values[key] || "#000000");
        input.setAttribute("aria-label", COLOR_LABELS[key] + " color");
        input.addEventListener("input", function () { swatch.style.background = input.value; });
        input.addEventListener("change", function () {
          var value = toOklch(input.value);
          values[key] = value;
          var patch = { colors: {} };
          patch.colors[key] = value;
          saveConfig(project, patch);
        });
        swatch.appendChild(input);
        colors.appendChild(swatch);
      })(COLOR_KEYS[i]);
    }
    box.appendChild(mrow("Colors", colors));

    var range = el("div", "bd-range");
    var slider = el("label", "bd-slider");
    var track = el("span", "bd-slider-track");
    track.appendChild(el("span", "bd-slider-fill"));
    slider.appendChild(track);
    slider.appendChild(el("span", "bd-slider-thumb"));
    var input = el("input", "bd-slider-input");
    input.type = "range";
    input.min = String(RADIUS.min);
    input.max = String(RADIUS.max);
    input.step = String(RADIUS.step);
    input.value = String(remOf(values.radius));
    input.setAttribute("aria-label", "Corner radius");
    slider.appendChild(input);
    var out = el("output", "");
    function paint() {
      slider.style.setProperty("--value", String((Number(input.value) - RADIUS.min) / (RADIUS.max - RADIUS.min)));
      out.textContent = input.value + "rem";
      input.setAttribute("aria-valuetext", input.value + " rem");
    }
    paint();
    input.addEventListener("input", paint);
    input.addEventListener("change", function () {
      values.radius = input.value + "rem";
      saveConfig(project, { radius: values.radius });
    });
    range.appendChild(slider);
    range.appendChild(out);
    box.appendChild(mrow("Radius", range));

    var fonts = el("div", "bd-selects");
    fonts.appendChild(select("Sans font", fontGroups(function (f) { return f.category !== "monospace"; }), values.fontSans, function (v) {
      values.fontSans = v;
      saveConfig(project, { font: { sans: v } });
    }));
    fonts.appendChild(select("Mono font", fontGroups(function (f) { return f.category === "monospace"; }), values.fontMono, function (v) {
      values.fontMono = v;
      saveConfig(project, { font: { mono: v } });
    }));
    box.appendChild(mrow("Font", fonts));

    box.appendChild(mrow("Icons", select("Icon library", ICON_LIBS, values.iconLibrary, function (v) {
      values.iconLibrary = v;
      saveConfig(project, { icons: { libraryId: v } });
    })));
  }

  // ---- The workspace ----
  // Nucleo glyphs, the ones the web app's project page uses for the same actions.
  var ICON_BACK = '<path d="M11.5 16C11.308 16 11.116 15.9271 10.97 15.7801L4.72 9.53C4.427 9.237 4.427 8.762 4.72 8.469L10.97 2.22C11.263 1.927 11.738 1.927 12.031 2.22C12.324 2.513 12.324 2.988 12.031 3.281L6.311 9.001L12.031 14.721C12.324 15.014 12.324 15.489 12.031 15.782C11.885 15.928 11.693 16.002 11.501 16.002Z"/>';
  var ICON_AWAY = '<path opacity="0.4" d="M12.25 1H6.25C4.731 1 3.5 2.231 3.5 3.75V13.25C3.5 14.769 4.731 16 6.25 16H12.25C13.769 16 15 14.769 15 13.25V3.75C15 2.231 13.769 1 12.25 1Z"/><path d="M11.25 6H7.24C6.826 6 6.49 6.336 6.49 6.75C6.49 7.164 6.826 7.5 7.24 7.5H9.439L1.22 15.72C0.927 16.013 0.927 16.487 1.22 16.78C1.366 16.927 1.558 17 1.75 17C1.942 17 2.134 16.927 2.28 16.78L10.5 8.56V10.76C10.5 11.174 10.836 11.51 11.25 11.51C11.664 11.51 12 11.174 12 10.76V6.75C12 6.336 11.664 6 11.25 6Z"/>';

  function iconButton(cls, paths, text, onClick) {
    var btn = button(cls, "", onClick);
    btn.innerHTML = '<svg class="bd-btn-icon" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">' + paths + "</svg>";
    btn.appendChild(document.createTextNode(text));
    return btn;
  }

  // The model reads this on the person's next message, so "make the shadow
  // softer" typed in the host's chat box reaches the open system.
  function describeOpen(isProject, item) {
    if (isProject) return "The person has their Better Design design system “" + item.title + "” (project id: " + item.id + ") open in the Better Design panel. A change they ask for applies to this system: make it with Better Design's change-design-system and this project id.";
    return "The person is looking at the " + item.name + " design system from Better Design's catalog (id: " + item.id + ") in the Better Design panel.";
  }

  function openWorkspace(kind, id) {
    ws = { kind: kind, id: id, view: "showcase", version: 1, iconPack: null, iconShown: ICON_PAGE, modifyFor: null };
    document.querySelector(".bd-panel").classList.add("is-workspace");
    setStatus("");
    renderSystems();
    window.scrollTo(0, 0);
  }

  function closeWorkspace() {
    ws = null;
    document.querySelector(".bd-panel").classList.remove("is-workspace");
    tellChat("The person is browsing the design system list in the Better Design panel. No system is open.");
    renderSystems();
  }

  function renderWorkspace(container) {
    var isProject = ws.kind === "project";
    var item = isProject ? projectById(ws.id) : systemById(ws.id);
    if (!item) { closeWorkspace(); return; }
    ws.name = isProject ? item.title : item.name;
    tellChat(describeOpen(isProject, item));
    var base = isProject ? systemById(item.baseId) : null;
    var root = el("section", "bd-ws");
    root.setAttribute("aria-label", ws.name);

    var head = el("div", "bd-ws-head");
    var nav = el("div", "bd-ws-nav");
    nav.appendChild(iconButton("bd-btn-secondary", ICON_BACK, "All design systems", closeWorkspace));
    var actions = el("div", "bd-actions");
    if (isProject) {
      var toggle = button("bd-btn-secondary bd-toggle", "Modify", function () {
        var open = ws.modifyEl.hidden;
        ws.modifyEl.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        if (open && ws.modifyFor !== item.fragmentId) renderModify();
      });
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "bd-modify");
      actions.appendChild(toggle);
    }
    if (!isProject || item.status === "ready") {
      actions.appendChild(button("bd-btn-secondary", "Use in this chat", function () {
        if (isProject) send("Use my Better Design design system “" + item.title + "” (project id: " + item.id + ") for what we build in this chat.", item.title);
        else send("Use the " + item.name + " design system from Better Design (id: " + item.id + ") for what we build in this chat.", item.name);
      }));
    }
    if (!isProject) {
      actions.appendChild(button("bd-btn-primary", "Make my own from it", function () {
        send("Create a Better Design design system for my product, based on " + item.name + " (id: " + item.id + "). My product is ", "Your request", true);
      }));
    }
    actions.appendChild(iconButton("bd-btn-secondary", ICON_AWAY, "Open in Better Design", function () {
      openExternal(isProject ? APP + "/projects/" + encodeURIComponent(item.id) : APP + "/design-systems/" + encodeURIComponent(item.id));
    }));
    nav.appendChild(actions);
    head.appendChild(nav);
    head.appendChild(el("h2", "bd-ws-title", ws.name));
    var STATUS_WORDS = { starting: "Starting", generating: "Generating", ready: "Ready", failed: "Failed" };
    var meta = isProject
      ? (base ? "Built on " + base.name + " · " : "") + new Date(item.createdAt).toLocaleDateString([], { day: "numeric", month: "short" }) + (item.status !== "ready" ? " · " + (STATUS_WORDS[item.status] || item.status) : "")
      : item.description;
    if (meta) head.appendChild(el("p", "bd-note", meta));
    if (isProject && item.status === "ready") head.appendChild(el("p", "bd-note", "Type a change in the chat, such as: make the card shadow softer. The new version shows here."));
    ws.statusEl = el("p", "bd-ws-status");
    ws.statusEl.setAttribute("role", "status");
    ws.statusEl.setAttribute("aria-live", "polite");
    head.appendChild(ws.statusEl);
    if (isProject) {
      ws.modifyEl = el("div", "bd-modify");
      ws.modifyEl.id = "bd-modify";
      ws.modifyEl.setAttribute("aria-label", "Modify the tokens");
      ws.modifyEl.hidden = true;
      head.appendChild(ws.modifyEl);
    }
    root.appendChild(head);

    var main = el("div", "bd-ws-main");
    // The web app's project page has tabs and its catalog page has none; the panel follows each.
    ws.viewTabs = [];
    if (isProject) main.appendChild(viewTabs());
    ws.stage = el("div", "bd-stage");
    if (isProject) ws.stage.setAttribute("role", "tabpanel");
    main.appendChild(ws.stage);
    root.appendChild(main);
    container.appendChild(root);
    showView(ws.view);
  }
`;

/** The workspace script, with the option lists and the web app origin it reads. */
export const DESIGN_PANEL_WORKSPACE_JS = CONSTANTS + WORKSPACE_JS;
