// The design panel ChatGPT opens from its sidebar and from the panel beside a
// conversation. The host calls the panel tool with `{}` and pushes the result
// into this page as structuredContent: the latest checks, the person's design
// systems and the catalog. Opening a system shows it the way the web app's
// project page does (design-panel-workspace.ts). Buttons that need the model
// send a ready prompt into the chat with ui/message.
import { PREVIEW_CARDS_MAX_PROJECTS, PREVIEW_CARDS_MESSAGE, PREVIEW_CARDS_PATH } from "../design-panel-cards";
import { DESIGN_PANEL_CSS } from "./design-panel-css";
import { DESIGN_PANEL_WORKSPACE_JS } from "./design-panel-workspace";
import { PREVIEW_WIDGET_SDK_JS } from "./preview-widget-sdk.generated";

/**
 * The ui:// resource URI of the design panel. Keep it stable once it ships: a
 * connected ChatGPT caches its resource list, so a renamed URI shows "Failed
 * to fetch template" (see DS_PREVIEW_WIDGET_URI). Markup changes ship under
 * this URI.
 */
export const DESIGN_PANEL_WIDGET_URI = "ui://widget/design-panel.html";

// Plain ES5 so it runs in every host sandbox without a build step. Every
// string from the tool result goes through textContent or a style property,
// never innerHTML. Icon shapes go through DOMParser and a shape allowlist.
const PANEL_JS = `
(function () {
  var data = { checks: [], projects: [], systems: [] };
  var loaded = false;
  var tab = null;
  var query = "";
  var bdApp = null;
  var CHECK_KINDS = { "check-comprehension": "Text", "inspect-spacing": "Spacing" };
  var STATUS_TEXT = { starting: "Starting", generating: "Generating", ready: "Ready", failed: "Failed" };
  var CARDS = ${JSON.stringify(PREVIEW_CARDS_MESSAGE)};
  var CARDS_PATH = ${JSON.stringify(PREVIEW_CARDS_PATH)};
  var CARDS_MAX = ${PREVIEW_CARDS_MAX_PROJECTS};
  var review = document.getElementById("bd-review");
  var systemsBody = document.getElementById("bd-systems");
  var tabs = [document.getElementById("bd-tab-review"), document.getElementById("bd-tab-systems")];
  var status = document.getElementById("bd-status");

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function button(cls, text, onClick) {
    var btn = el("button", "bd-btn " + cls, text);
    btn.type = "button";
    btn.addEventListener("click", onClick);
    return btn;
  }

  // Status lines go to the open workspace, else to the panel's footer.
  function setStatus(text) {
    if (ws && ws.statusEl) ws.statusEl.textContent = text;
    else status.textContent = text;
  }

  // A draft lands in the composer for the person to finish; a message is sent at once.
  function send(text, label, draft) {
    var sent = null;
    if (bdApp && bdApp.sendMessage) sent = bdApp.sendMessage({ text: text, draft: !!draft });
    else if (window.openai && window.openai.sendFollowUpMessage) sent = window.openai.sendFollowUpMessage({ prompt: text });
    if (!sent) { setStatus("This panel cannot post to the chat here. Type: " + text); return; }
    Promise.resolve(sent).then(function () {
      setStatus(draft ? label + " is in the composer. Finish it and send." : label + " is in the chat.");
    }, function () {
      setStatus("The chat did not accept the message. Type: " + text);
    });
  }

  // Tells the model what the panel shows, without a message in the thread.
  // ChatGPT reads widget state on hosts without the MCP Apps call.
  function tellChat(text) {
    try {
      if (bdApp && bdApp.updateModelContext) Promise.resolve(bdApp.updateModelContext({ text: text })).catch(function () {});
      else if (window.openai && window.openai.setWidgetState) window.openai.setWidgetState({ modelContent: text });
    } catch (e) { /* the chat then learns the system from the person's message */ }
  }

  function timeOf(iso) {
    var d = new Date(iso);
    var time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var today = new Date();
    var yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today " + time;
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday " + time;
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + time;
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // "Text on \u201cPricing\u201d", or "Spacing check" when the agent named no screen.
  function checkTitle(run) {
    var kind = CHECK_KINDS[run.tool] || run.tool;
    return run.subject ? kind + " on \u201c" + run.subject + "\u201d" : kind + " check";
  }

  // "At 390 pixels wide", "At 390, 1440 and 1728 pixels wide".
  function widthsText(widths) {
    if (!widths || !widths.length) return "";
    var list = widths.length < 2 ? String(widths[0]) : widths.slice(0, -1).join(", ") + " and " + widths[widths.length - 1];
    return "At " + list + " pixels wide";
  }

  // ---- Review ----
  function renderReview() {
    review.textContent = "";
    var checks = data.checks;
    if (!checks.length) {
      var empty = el("div", "bd-section");
      empty.appendChild(el("h2", "bd-h2", "No checks yet"));
      empty.appendChild(el("p", "bd-note", "Ask ChatGPT to check the screen you are building. The results show up here."));
      var row = el("div", "bd-actions");
      row.appendChild(button("bd-btn-primary", "Check my screen", function () {
        send("Check the interface we are building with Better Design: run the copy check and the spacing check, then fix what fails.", "The check request");
      }));
      empty.appendChild(row);
      review.appendChild(empty);
      return;
    }
    var failing = [];
    var list = el("div", "bd-section");
    for (var i = 0; i < checks.length; i++) {
      var run = checks[i];
      var card = el("article", "bd-card");
      var ok = run.findingCount === 0;
      var top = el("div", "bd-card-top");
      var name = el("span", "bd-card-name", checkTitle(run));
      name.appendChild(el("span", "bd-card-meta", " \u00b7 " + timeOf(run.ranAt)));
      top.appendChild(name);
      top.appendChild(el("span", "bd-verdict " + (ok ? "is-good" : "is-bad"), ok ? "Passed" : plural(run.findingCount, "problem", "problems")));
      card.appendChild(top);
      // One line per problem the panel keeps. Fix these sends the same ones, with their fixes.
      if (!ok) {
        var ul = el("ul", "bd-findings");
        failing = failing.concat(run.findings);
        for (var j = 0; j < run.findings.length; j++) {
          var f = run.findings[j];
          var li = el("li", "bd-finding");
          var dot = el("span", "bd-dot is-" + f.severity);
          dot.setAttribute("role", "img");
          dot.setAttribute("aria-label", f.severity);
          li.appendChild(dot);
          var text = el("span", "bd-finding-text", f.problem);
          var where = widthsText(f.widths);
          if (where) text.appendChild(el("span", "bd-finding-where", " " + where + "."));
          li.appendChild(text);
          ul.appendChild(li);
        }
        card.appendChild(ul);
        var more = run.findingCount - run.findings.length;
        if (more > 0) card.appendChild(el("p", "bd-card-more", "And " + plural(more, "more problem", "more problems") + "."));
      }
      list.appendChild(card);
    }
    review.appendChild(list);
    var actions = el("div", "bd-actions");
    if (failing.length) {
      actions.appendChild(button("bd-btn-primary", "Fix these in the chat", function () {
        var lines = [];
        for (var k = 0; k < failing.length; k++) {
          var at = widthsText(failing[k].widths);
          lines.push("- " + failing[k].problem + (at ? " (" + at.toLowerCase() + ")" : "") + (failing[k].fix ? " Fix: " + failing[k].fix : ""));
        }
        send("Fix these problems that Better Design's checks found, then run the checks again:\\n" + lines.join("\\n"), "The fix request");
      }));
    }
    // The fix request already asks for a new run, so Check again shows only when all passed.
    if (!failing.length) {
      actions.appendChild(button("bd-btn-secondary", "Check again", function () {
        send("Run Better Design's copy check and spacing check again on the interface we are building.", "The check request");
      }));
    }
    review.appendChild(actions);
  }

  // ---- Design system ----
  var ws = null; // the open workspace, from design-panel-workspace.ts
  var search = null;
  var brandRow = null;

  function systemById(id) {
    for (var i = 0; i < data.systems.length; i++) if (data.systems[i].id === id) return data.systems[i];
    return null;
  }

  function projectById(id) {
    for (var i = 0; i < data.projects.length; i++) if (data.projects[i].id === id) return data.projects[i];
    return null;
  }

  // A fresh copy of one project, from the panel tool, takes the old one's place.
  function replaceProject(next) {
    for (var i = 0; i < data.projects.length; i++) if (data.projects[i].id === next.id) data.projects[i] = next;
  }

  function dayOf(iso) {
    return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
  }

  // Any server tool, when the host lets the page call one.
  function callTool(name, args) {
    if (bdApp && bdApp.callServerTool) return bdApp.callServerTool({ name: name, arguments: args });
    if (window.openai && window.openai.callTool) return window.openai.callTool(name, args);
    return null;
  }

  function callPanel(args) { return callTool("open-design-panel", args); }

  function resultOf(res) {
    return res && (res.structuredContent || (res.result && res.result.structuredContent) || res);
  }
${DESIGN_PANEL_WORKSPACE_JS}
  // A pasted web address offers that site's brand in place of a separate form.
  function websiteIn(text) {
    var raw = text.trim();
    if (!raw || /\\s/.test(raw) || raw.indexOf(".") === -1) return null;
    if (!/^https?:\\/\\//i.test(raw) && !/^[a-z0-9-]+(\\.[a-z0-9-]+)+(\\/.*)?$/i.test(raw)) return null;
    return /^https?:\\/\\//i.test(raw) ? raw : "https://" + raw;
  }

  function renderBrandRow() {
    if (!brandRow) return;
    brandRow.textContent = "";
    var url = websiteIn(search.value);
    if (!url) return;
    var host = url.replace(/^https?:\\/\\//i, "").replace(/\\/.*$/, "");
    brandRow.appendChild(button("bd-btn-secondary", "Use the brand from " + host, function () {
      send("Take the brand from " + url + " with Better Design and use it for what we build in this chat.", "The brand from " + host);
    }));
  }

  // The cards come from the website's own preview page, framed once and kept
  // while a workspace is open, so going back does not reload every card.
  var listView = null;
  var wsView = null;
  var mine = null;
  var pendingRows = null;
  var catalogEmpty = null;
  var mineFrame = null;
  var catalogFrame = null;

  // A row that names one system, for a project still generating and for when
  // the previews cannot load.
  function itemRow(item, onOpen) {
    var li = el("li");
    var row = el("button", "bd-row bd-proj");
    row.type = "button";
    var text = el("span", "bd-proj-text");
    text.appendChild(el("span", "bd-row-name", item.name));
    if (item.caption) text.appendChild(el("span", "bd-row-status", item.caption));
    row.appendChild(text);
    row.addEventListener("click", function () { onOpen(item.id); });
    li.appendChild(row);
    return li;
  }

  function cardFrame(title, onOpen) {
    var frame = { node: el("iframe", "bd-cards"), note: el("p", "bd-note"), rows: el("ul", "bd-rows"), items: [], src: "", ready: false, measured: false, failed: false, timer: null, onOpen: onOpen };
    frame.node.title = title;
    frame.rows.hidden = true;
    return frame;
  }

  function frameParts(frame, section) {
    section.appendChild(frame.note);
    section.appendChild(frame.node);
    section.appendChild(frame.rows);
  }

  // The browser does not lay out a frame from another site that it cannot
  // see, so a frame with no height never reports one. Until the page reports
  // its own height, the frame takes the height its cards will need. These
  // numbers mirror the card page's grid (app/embed/design-systems/
  // embed-card-grid.tsx): its breakpoints, its gap, its top padding, and each
  // card's 16:10 screen over a 3rem footer and two borders.
  var GRID = { two: 640, three: 1024, gap: 24, top: 4, footer: 50, ratio: 0.625 };
  function estimateHeight(frame) {
    var width = frame.node.clientWidth || document.body.clientWidth - 32;
    var cols = width >= GRID.three ? 3 : width >= GRID.two ? 2 : 1;
    var rows = Math.ceil(frame.items.length / cols);
    var card = (width - GRID.gap * (cols - 1)) / cols * GRID.ratio + GRID.footer;
    return rows ? rows * card + (rows - 1) * GRID.gap + GRID.top : 0;
  }

  // Tells the frame which cards to show, in order. A frame that never loaded
  // lists the same systems as rows.
  function showCards(frame, items) {
    // A new card count starts from the estimate again, so a frame that shrank
    // to nothing for an empty search has room to report its new height.
    if (items.length !== frame.items.length) frame.measured = false;
    frame.items = items;
    if (!frame.measured) frame.node.style.height = estimateHeight(frame) / 16 + "rem";
    if (frame.ready && frame.node.contentWindow) frame.node.contentWindow.postMessage({ type: CARDS.show, items: items }, APP);
    if (!frame.failed) return;
    frame.rows.textContent = "";
    for (var i = 0; i < items.length; i++) frame.rows.appendChild(itemRow(items[i], frame.onOpen));
    frame.rows.hidden = !items.length;
  }

  // The frame in place of its rows, with a note until it reports its height.
  function showFrame(frame) {
    frame.failed = false;
    frame.rows.hidden = true;
    frame.node.hidden = false;
    frame.note.textContent = "Loading previews\u2026";
    frame.note.hidden = false;
  }

  function loadFrame(frame, src) {
    if (frame.src === src) return;
    frame.src = src;
    frame.ready = false;
    frame.measured = false;
    showFrame(frame);
    frame.node.src = src;
    clearTimeout(frame.timer);
    frame.timer = setTimeout(function () {
      if (frame.ready) return;
      frame.failed = true;
      frame.node.hidden = true;
      frame.note.textContent = "The previews did not load.";
      showCards(frame, frame.items);
    }, 20000);
  }

  function hideFrame(frame) {
    clearTimeout(frame.timer);
    frame.src = "";
    frame.node.hidden = frame.note.hidden = frame.rows.hidden = true;
  }

  // Only the two card frames speak, and only from the web app's origin.
  function frameOf(source) {
    if (!source || !mineFrame) return null;
    if (source === mineFrame.node.contentWindow) return mineFrame;
    return source === catalogFrame.node.contentWindow ? catalogFrame : null;
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    var frame = event.origin === APP ? frameOf(event.source) : null;
    if (!frame || !msg || typeof msg !== "object") return;
    if (msg.type === CARDS.ready) {
      // A slow frame that loads after the rows took its place takes it back.
      if (frame.failed) showFrame(frame);
      frame.ready = true;
      clearTimeout(frame.timer);
      showCards(frame, frame.items);
    } else if (msg.type === CARDS.height && typeof msg.height === "number" && msg.height >= 0 && frame.node.clientWidth) {
      // A hidden frame has no width and reports a height that means nothing.
      frame.measured = true;
      frame.node.style.height = msg.height / 16 + "rem";
      frame.note.hidden = true;
    } else if (msg.type === CARDS.open && typeof msg.id === "string") {
      frame.onOpen(msg.id);
    }
  });

  function openProjectVersion(fragmentId) {
    for (var i = 0; i < data.projects.length; i++) {
      if (data.projects[i].fragmentId === fragmentId) { openWorkspace("project", data.projects[i].id); return; }
    }
  }

  function openProject(id) { openWorkspace("project", id); }
  function openSystem(id) { if (systemById(id)) openWorkspace("system", id); }

  function projectCaption(p) {
    var base = systemById(p.baseId);
    var meta = (base ? "Built on " + base.name + " · " : "") + dayOf(p.createdAt);
    if (p.status !== "ready") meta += " · " + (STATUS_TEXT[p.status] || p.status);
    return meta;
  }

  function renderCatalog() {
    if (!catalogFrame) return;
    renderBrandRow();
    var items = [];
    for (var i = 0; i < data.systems.length; i++) {
      var s = data.systems[i];
      if (query && (s.name + " " + s.description).toLowerCase().indexOf(query) === -1) continue;
      items.push({ id: s.id, name: s.name });
    }
    showCards(catalogFrame, items);
    catalogEmpty.textContent = "";
    if (items.length) return;
    if (data.systems.length && websiteIn(search.value)) return;
    var empty = el("p", "bd-empty", data.systems.length ? "No design system matches “" + search.value + "”. " : "The catalog did not load. Ask ChatGPT to find a design system.");
    if (data.systems.length) {
      var clear = el("button", "bd-link", "Clear search");
      clear.type = "button";
      clear.addEventListener("click", function () { search.value = ""; query = ""; renderCatalog(); search.focus(); });
      empty.appendChild(clear);
    }
    catalogEmpty.appendChild(empty);
  }

  function buildList() {
    listView = el("div", "bd-list");
    mine = el("section", "bd-section");
    mine.appendChild(el("h2", "bd-h2", "Your design systems"));
    mineFrame = cardFrame("Your design systems", openProjectVersion);
    frameParts(mineFrame, mine);
    pendingRows = el("ul", "bd-rows");
    mine.appendChild(pendingRows);
    listView.appendChild(mine);

    var catalog = el("section", "bd-section");
    catalog.appendChild(el("h2", "bd-h2", "Catalog"));
    search = el("input", "bd-field bd-search");
    search.type = "search";
    search.placeholder = "Search, or paste your website";
    search.setAttribute("aria-label", "Search design systems, or paste a website to use its brand");
    search.autocomplete = "off";
    search.addEventListener("input", function () { query = search.value.trim().toLowerCase(); renderCatalog(); });
    catalog.appendChild(search);
    brandRow = el("div", "bd-actions");
    catalog.appendChild(brandRow);
    catalogFrame = cardFrame("Design system catalog", openSystem);
    frameParts(catalogFrame, catalog);
    catalogEmpty = el("div");
    catalog.appendChild(catalogEmpty);
    listView.appendChild(catalog);

    wsView = el("div", "bd-list");
    systemsBody.appendChild(listView);
    systemsBody.appendChild(wsView);
  }

  // Projects with a version show as cards; a project still generating shows as a row.
  function fillList() {
    var cards = [];
    pendingRows.textContent = "";
    for (var i = 0; i < data.projects.length; i++) {
      var p = data.projects[i];
      var caption = projectCaption(p);
      if (p.fragmentId && cards.length < CARDS_MAX) cards.push({ id: p.fragmentId, name: p.title, caption: caption });
      else pendingRows.appendChild(itemRow({ id: p.id, name: p.title, caption: caption }, openProject));
    }
    mine.hidden = !data.projects.length;
    pendingRows.hidden = !pendingRows.childNodes.length;
    var ids = cards.map(function (c) { return encodeURIComponent(c.id); }).join(",");
    if (cards.length) loadFrame(mineFrame, APP + CARDS_PATH + "?projects=" + ids);
    else hideFrame(mineFrame);
    showCards(mineFrame, cards);
    if (data.systems.length) loadFrame(catalogFrame, APP + CARDS_PATH);
    else hideFrame(catalogFrame);
    renderCatalog();
  }

  function renderSystems() {
    if (!listView) buildList();
    wsView.textContent = "";
    listView.hidden = !!ws;
    if (ws) { renderWorkspace(wsView); return; }
    fillList();
  }

  // ---- Tabs ----
  function show(name, focus) {
    tab = name;
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute("data-tab") === name;
      tabs[i].setAttribute("aria-selected", String(on));
      tabs[i].tabIndex = on ? 0 : -1;
      if (on && focus) tabs[i].focus();
    }
    review.hidden = name !== "review";
    systemsBody.hidden = name !== "systems";
    status.textContent = "";
  }

  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener("click", function () { show(this.getAttribute("data-tab"), false); });
    tabs[t].addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      show(tab === "review" ? "systems" : "review", true);
    });
  }

  function load(next) {
    if (!next || !Array.isArray(next.systems)) return;
    data = {
      checks: Array.isArray(next.checks) ? next.checks : [],
      projects: Array.isArray(next.projects) ? next.projects : [],
      systems: next.systems,
    };
    var first = !loaded;
    loaded = true;
    renderReview();
    // A reload must not tear down an open workspace and its showcase frame.
    if (!ws || !(ws.kind === "project" ? projectById(ws.id) : systemById(ws.id))) {
      if (ws) closeWorkspace();
      else renderSystems();
    }
    // Open on Review when there is something to review, else on the systems.
    if (first) show(data.checks.length ? "review" : "systems", false);
  }

  show("review", false);
  review.appendChild(el("p", "bd-note", "Loading\\u2026"));

  if (window.openai) {
    load(window.openai.toolOutput);
    window.addEventListener("openai:set_globals", function (event) {
      var g = event && event.detail && event.detail.globals;
      load((g && g.toolOutput) || window.openai.toolOutput);
    });
  }

  try {
    var mcp = window.__bdMcp;
    if (mcp && mcp.App) {
      var app = new mcp.App({ name: "Better Design Panel", version: "1.0.0" });
      bdApp = app;
      app.ontoolresult = function (params) {
        load(params && (params.structuredContent || (params.result && params.result.structuredContent)));
      };
      app.onhostcontextchanged = function (ctx) {
        if (ctx && ctx.theme && mcp.applyDocumentTheme) mcp.applyDocumentTheme(ctx.theme);
        if (ctx && ctx.styles && ctx.styles.css && ctx.styles.css.fonts && mcp.applyHostFonts) mcp.applyHostFonts(ctx.styles.css.fonts);
      };
      app.connect().catch(function () { /* a host without the handshake still renders window.openai data */ });
    }
  } catch (e) { /* no MCP Apps bridge in this host; the window.openai path covers ChatGPT */ }
})();
`;

/** The design panel page, registered as a ui:// resource and opened by ChatGPT entrypoints. */
export const DESIGN_PANEL_WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Better Design</title>
<style>${DESIGN_PANEL_CSS}</style>
</head>
<body>
<main class="bd-panel">
  <div class="bd-head">
    <h1 class="bd-title">Better Design</h1>
    <div class="bd-tabs" role="tablist" aria-label="Panel sections">
      <button class="bd-tab" id="bd-tab-review" data-tab="review" type="button" role="tab" aria-controls="bd-review" aria-selected="true">Review</button>
      <button class="bd-tab" id="bd-tab-systems" data-tab="systems" type="button" role="tab" aria-controls="bd-systems" aria-selected="false" tabindex="-1">Design system</button>
    </div>
  </div>
  <div class="bd-body" id="bd-review" role="tabpanel" aria-labelledby="bd-tab-review"></div>
  <div class="bd-body" id="bd-systems" role="tabpanel" aria-labelledby="bd-tab-systems" hidden></div>
  <div class="bd-foot">
    <p class="bd-status" id="bd-status" role="status" aria-live="polite"></p>
  </div>
</main>
<script>${PREVIEW_WIDGET_SDK_JS.replace(/<\/script/gi, "<\\/script")}</script>
<script>${PANEL_JS}</script>
</body>
</html>`;
