import { SPACING_FINDING_COPY } from "../inspection/finding-copy";
import { PREVIEW_WIDGET_SDK_JS } from "./preview-widget-sdk.generated";

/** The resource URI a host asks for to render the spacing overlay widget. */
export const SPACING_INSPECTION_WIDGET_URI = "ui://widget/spacing-inspection-v1.html";

/**
 * The widget document itself, inlined so it needs no network fetch at render
 * time and works in a host that blocks outside requests.
 */
export const SPACING_INSPECTION_WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
/* Cashmere DS tokens — warm paper, near-black ink, rounded type, soft shadows. */
:root {
  color-scheme: light dark;
  --bg: oklch(0.957 0.008 85);
  --fg: oklch(0.31 0.006 75);
  --ink: oklch(0.235 0.004 75);
  --card: oklch(1 0 0);
  --muted: oklch(0.55 0.009 80);
  --border: oklch(0.905 0.009 85);
  --blue: oklch(0.48 0.14 252);
  --orange: oklch(0.52 0.18 35);
  --red: oklch(0.52 0.16 28);
  --critical: var(--red);
  --serious: var(--orange);
  --moderate: var(--blue);
  --label-bg: oklch(0.26 0.008 75 / 0.94);
  --label-fg: oklch(0.96 0.004 85);
  --shadow-sm: 0 0 0 1px oklch(0.30 0.01 75 / 0.05), 0 1px 2px oklch(0.30 0.01 75 / 0.05);
  --shadow-lg: 0 0 0 1px oklch(0.30 0.01 75 / 0.035), 0 6px 16px -10px oklch(0.30 0.01 75 / 0.06), 0 16px 44px -20px oklch(0.30 0.01 75 / 0.08);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.20 0.006 75);
    --fg: oklch(0.80 0.008 82);
    --ink: oklch(0.95 0.005 85);
    --card: oklch(0.25 0.006 75);
    --muted: oklch(0.74 0.008 82);
    --border: oklch(0.34 0.008 80);
    --blue: oklch(0.80 0.10 245);
    --orange: oklch(0.82 0.11 55);
    --red: oklch(0.80 0.11 25);
    --shadow-sm: 0 0 0 1px oklch(0 0 0 / 0.30), 0 1px 2px oklch(0 0 0 / 0.30);
    --shadow-lg: 0 0 0 1px oklch(0 0 0 / 0.28), 0 8px 24px -12px oklch(0 0 0 / 0.45);
  }
}
:root.dark, :root[data-theme="dark"] {
  --bg: oklch(0.20 0.006 75);
  --fg: oklch(0.80 0.008 82);
  --ink: oklch(0.95 0.005 85);
  --card: oklch(0.25 0.006 75);
  --muted: oklch(0.74 0.008 82);
  --border: oklch(0.34 0.008 80);
  --blue: oklch(0.80 0.10 245);
  --orange: oklch(0.82 0.11 55);
  --red: oklch(0.80 0.11 25);
  --shadow-sm: 0 0 0 1px oklch(0 0 0 / 0.30), 0 1px 2px oklch(0 0 0 / 0.30);
  --shadow-lg: 0 0 0 1px oklch(0 0 0 / 0.28), 0 8px 24px -12px oklch(0 0 0 / 0.45);
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-rounded, "SF Pro Rounded", "SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; }
.shell { display: grid; min-height: 220px; align-content: start; justify-items: center; padding: 24px 20px; background: var(--bg); }
.header { width: min(100%, 780px); margin: 0 0 16px; }
.body { width: min(100%, 780px); margin: 0; }
h1 { margin: 0; color: var(--ink); font-size: 23px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.3; text-wrap: balance; }
.meta { margin: 8px 0 0; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; line-height: 1.45; }
.critical { color: var(--critical); }
.serious { color: var(--serious); }
.moderate { color: var(--moderate); }
.stage { position: relative; width: 100%; overflow: hidden; border: 1px solid var(--border); border-radius: 16px; background: var(--card); box-shadow: var(--shadow-lg); }
.shot { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: fill; }
.overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.wire { fill: none; stroke: var(--border); stroke-width: 1; vector-effect: non-scaling-stroke; }
.mark { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
.mark.critical { stroke: var(--critical); }
.mark.serious { stroke: var(--serious); }
.mark.moderate { stroke: var(--moderate); }
.leader { stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
.leader.critical { stroke: var(--critical); }
.leader.serious { stroke: var(--serious); }
.leader.moderate { stroke: var(--moderate); }
.label-bg { fill: var(--label-bg); }
.label-text { fill: var(--label-fg); font: 600 11px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; }
.findings { display: grid; gap: 12px; margin-top: 0; }
.finding { border: 1px solid var(--border); border-radius: 16px; padding: 16px; background: var(--card); box-shadow: var(--shadow-sm); }
.finding-head { display: flex; align-items: center; gap: 8px; }
.finding h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 600; line-height: 1.4; }
.evidence { margin: 8px 0 0; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; line-height: 1.5; }
ul.evidence { padding-inline-start: 1rem; }
.fix { margin: 8px 0 0; color: var(--fg); font-size: 13px; font-weight: 600; line-height: 1.5; }
.findings-more, .finding-details, .capture-details { margin-top: 12px; }
.findings-more > summary, .finding-details > summary, .capture-details > summary { display: list-item; min-height: 44px; align-content: center; width: fit-content; color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
.findings-more > summary:focus-visible, .finding-details > summary:focus-visible, .capture-details > summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.findings-more-list { display: grid; gap: 12px; margin-top: 12px; }
.message { width: min(100%, 780px); margin: 0; border: 1px solid var(--border); border-radius: 16px; padding: 24px; background: var(--card); box-shadow: var(--shadow-lg); }
.message p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
@media (max-width: 480px) {
  .shell { padding: 20px 16px; }
  h1 { font-size: 21px; }
  .finding-head { align-items: flex-start; flex-direction: column; }
}
</style>
</head>
<body>
<main id="root" class="shell"><section class="message"><h1>No spacing measured yet</h1><p>Capture the page at the requested screen widths, then check its spacing.</p></section></main>
<script>${PREVIEW_WIDGET_SDK_JS.replace(/<\/script/gi, "<\\/script")}</script>
<script>
(function () {
  var root = document.getElementById("root");
  var visibleFindingLimit = 1;
  var findingCopy = ${JSON.stringify(SPACING_FINDING_COPY).replace(/</g, "\\u003c")};

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resultTitle(total, incomplete) {
    if (!total) return incomplete ? "Spacing check is incomplete" : "No spacing issues found";
    return total === 1 ? "One spacing issue found" : total + " spacing issues found";
  }

  function stateLabel(state) {
    var genericNames = { phone: "Phone", mobile: "Phone", tablet: "Tablet", desktop: "Desktop", wide: "Wide" };
    var widthNames = { 390: "Phone", 768: "Tablet", 1440: "Desktop", 1728: "Wide" };
    var name = String(state.name || "").trim();
    var genericName = genericNames[name.toLowerCase()];
    if (genericName) return genericName;
    var generatedName = name.match(/^viewport-([0-9]+)$/i);
    if (generatedName && Number(generatedName[1]) === state.viewport.width) return widthNames[state.viewport.width] || "Screen";
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    return widthNames[state.viewport.width] || "Screen";
  }

  function findingElementIds(finding) {
    var ids = (finding.elementIds || []).slice();
    var primaryIndex = findingCopy[finding.ruleId]?.primaryElementIndex || 0;
    if (primaryIndex > 0 && ids[primaryIndex]) ids.unshift(ids.splice(primaryIndex, 1)[0]);
    return ids;
  }

  function findingLocation(finding, state) {
    var ids = findingElementIds(finding);
    if (findingCopy[finding.ruleId]?.primaryElementIndex != null) ids = ids.slice(0, 1);
    var names = ids.map(function (id) {
      var element = state?.elements.find(function (item) { return item.id === id; });
      return element?.name || element?.label || id;
    });
    var text = names.slice(0, 2).join(" and ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
    // A description such as "the list holding …" opens the line, so it takes a capital.
    var first = state?.elements.find(function (item) { return item.id === ids[0]; });
    return first && first.name && first.name !== first.label ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function showOnOverlay(finding) {
    if (finding.severity === "critical" || finding.severity === "serious") return true;
    return finding.ruleId === "spacing/sibling-gap-drift"
      || finding.ruleId === "spacing/touch-target"
      || finding.ruleId === "spacing/alignment-drift";
  }

  function severityRank(severity) {
    return { critical: 3, serious: 2, moderate: 1 }[severity] || 0;
  }

  function prioritizeFindings(findings) {
    return findings.slice().sort(function (a, b) {
      return severityRank(b.severity) - severityRank(a.severity);
    });
  }

  function measurementContext(finding) {
    var message = finding.message || "";
    var prefix = finding.state + " uses ";
    if (finding.ruleId === "spacing/off-scale-value" && message.startsWith(prefix)) return message.slice(prefix.length);
    return message;
  }

  function groupingKey(finding, state) {
    var ids = finding.elementIds || [];
    if (!findingCopy[finding.ruleId] || !state || !ids.length || ids.some(function (id) { return !id; })) return null;
    if (ids.some(function (id) { return !state.elements.some(function (element) { return element.id === id; }); })) return null;
    var labels = ids.map(function (id) {
      var element = state.elements.find(function (item) { return item.id === id; });
      return element?.name || element?.label || id;
    });
    return JSON.stringify([finding.ruleId, finding.severity, ids, labels, finding.evidence || [], measurementContext(finding), finding.fix]);
  }

  function groupFindings(findings, states) {
    var groups = [];
    prioritizeFindings(findings).forEach(function (finding) {
      var state = states.find(function (item) { return item.name === finding.state; });
      var key = groupingKey(finding, state);
      var group = key && groups.find(function (item) {
        return item.key === key && !item.observations.some(function (observation) { return observation.finding.state === finding.state; });
      });
      var observation = { finding: finding, state: state };
      if (group) group.observations.push(observation);
      else groups.push({ key: key, observations: [observation] });
    });
    return groups;
  }

  function stateSvg(state, findings) {
    var width = state.viewport.width;
    var height = state.viewport.height;
    var byId = {};
    state.elements.forEach(function (element) { byId[element.id] = element; });
    var wire = state.screenshotDataUrl ? "" : state.elements.map(function (element) {
      var r = element.rect;
      return '<rect class="wire" x="' + r.x + '" y="' + r.y + '" width="' + r.width + '" height="' + r.height + '" />';
    }).join("");
    var placed = [];
    function placeLabel(rect, labelWidth) {
      var x = Math.max(0, Math.min(width - labelWidth, rect.x));
      var candidates = [
        { x: x, y: Math.max(2, rect.y - 23) },
        { x: Math.max(0, Math.min(width - labelWidth, rect.x + rect.width - labelWidth)), y: Math.min(height - 20, rect.y + rect.height + 5) },
        { x: 4, y: 4 + placed.length * 21 },
      ];
      var chosen = candidates.find(function (candidate) {
        return !placed.some(function (box) {
          return candidate.x < box.x + box.width + 4
            && candidate.x + labelWidth + 4 > box.x
            && candidate.y < box.y + 22
            && candidate.y + 22 > box.y;
        });
      }) || candidates[candidates.length - 1];
      var box = { x: chosen.x, y: chosen.y, width: labelWidth, height: 18 };
      placed.push(box);
      return box;
    }
    var overlayFindings = prioritizeFindings(findings).slice(0, visibleFindingLimit).filter(showOnOverlay);
    var marks = overlayFindings.map(function (finding) {
      return findingElementIds(finding).map(function (id, elementIndex) {
        var element = byId[id];
        if (!element) return "";
        var r = element.rect;
        var label = "Check this area";
        var labelWidth = Math.min(230, Math.max(92, label.length * 6.6 + 14));
        var showLabel = elementIndex === 0;
        var box = showLabel ? placeLabel(r, labelWidth) : null;
        return '<rect class="mark ' + finding.severity + '" x="' + r.x + '" y="' + r.y + '" width="' + r.width + '" height="' + r.height + '" rx="3" />' +
          (showLabel && box ? '<line class="leader ' + finding.severity + '" x1="' + (r.x + Math.min(r.width, 24)) + '" y1="' + r.y + '" x2="' + (box.x + 8) + '" y2="' + (box.y + 9) + '" />' +
          '<rect class="label-bg" x="' + box.x + '" y="' + box.y + '" width="' + labelWidth + '" height="18" rx="9" />' +
          '<text class="label-text" x="' + (box.x + 7) + '" y="' + (box.y + 12) + '">' + esc(label) + '</text>' : "");
      }).join("");
    }).join("");
    return '<svg class="overlay" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Measured spacing findings for ' + esc(state.name) + '">' + wire + marks + '</svg>';
  }

  function paddingEvidence(finding) {
    var labels = finding.ruleId === "spacing/asymmetric-horizontal-inset" ? ["Left padding", "Right padding"]
      : finding.ruleId === "spacing/asymmetric-vertical-inset" ? ["Top padding", "Bottom padding"] : [];
    return (finding.evidence || []).filter(function (item) { return labels.indexOf(item.label) >= 0; });
  }

  function findingDetails(finding, shownEvidence) {
    var context = findingCopy[finding.ruleId]?.needsMeasurementContext && finding.message
      ? '<p class="evidence">' + esc(measurementContext(finding)) + '</p>' : "";
    var measurements = (finding.evidence || []).filter(function (item) { return shownEvidence.indexOf(item) < 0; }).map(function (item) {
      return '<li>' + esc(item.label) + ': ' + esc(item.value) + esc(item.unit || "") + '</li>';
    }).join("");
    if (!measurements && !context) return "";
    return '<details class="finding-details"><summary>Measurements</summary>' + context + (measurements ? '<ul class="evidence">' + measurements + '</ul>' : "") + '</details>';
  }

  function findingTitle(finding, state) {
    var copy = findingCopy[finding.ruleId];
    if (!copy) return finding.message;
    var location = findingLocation(finding, state);
    if (!location) return copy.title;
    if (finding.ruleId.indexOf("spacing/asymmetric-") === 0) return location + " has " + copy.title.toLowerCase();
    return location + ": " + copy.title.charAt(0).toLowerCase() + copy.title.slice(1);
  }

  function captureContext(observations) {
    var states = observations.map(function (item) { return item.state; });
    var allGeneric = states.every(function (state) {
      return state && /^(phone|mobile|tablet|desktop|wide|viewport-[0-9]+)$/i.test(state.name);
    });
    if (!allGeneric) return observations.map(function (item) {
      return item.state ? stateLabel(item.state) + ", " + item.state.viewport.width + "px" : item.finding.state;
    }).join("; ");
    var widths = states.map(function (state) { return state.viewport.width; }).filter(function (width, index, values) { return values.indexOf(width) === index; }).sort(function (a, b) { return a - b; });
    return (widths.length === 1 ? widths[0] : widths.slice(0, -1).join(", ") + " and " + widths[widths.length - 1]) + "px";
  }

  function findingCard(group, states) {
    var observation = group.observations[0];
    var finding = observation.finding;
    var copy = findingCopy[finding.ruleId];
    var shownEvidence = paddingEvidence(finding);
    var measurement = shownEvidence.map(function (item) { return item.label.replace(" padding", "") + ": " + item.value + (item.unit || "") + "."; }).join(" ");
    return '<article class="finding" data-rule="' + esc(finding.ruleId) + '"><div class="finding-head"><h2>' + esc(findingTitle(finding, observation.state)) + '</h2></div>' +
      (group.observations.length < states.length ? '<p class="evidence finding-captures">' + esc(captureContext(group.observations)) + '</p>' : "") +
      (measurement ? '<p class="evidence finding-measurement">' + esc(measurement) + '</p>' : "") +
      '<p class="fix">' + esc(copy?.fix || finding.fix) + '</p>' + findingDetails(finding, shownEvidence) + '</article>';
  }

  function findingSections(groups, states) {
    if (!groups.length) return { primary: "", more: "" };
    var renderCard = function (group) { return findingCard(group, states); };
    var primary = groups.slice(0, visibleFindingLimit).map(renderCard).join("");
    var remaining = groups.slice(visibleFindingLimit);
    var more = remaining.length
      ? '<details class="findings-more"><summary>Show ' + remaining.length + ' more</summary><div class="findings-more-list">' + remaining.map(renderCard).join("") + '</div></details>'
      : "";
    return {
      primary: '<section class="findings findings-primary" aria-label="Priority spacing findings">' + primary + '</section>',
      more: more,
    };
  }

  function captureScreenshots(states, findings) {
    return states.filter(function (state) { return state.screenshotDataUrl; }).map(function (state) {
      var title = stateLabel(state) + ", " + state.viewport.width + "px";
      var matches = findings.filter(function (finding) { return finding.state === state.name; });
      return '<details class="capture-details" data-capture="' + esc(state.name) + '"><summary>Screenshot: ' + esc(title) + '</summary>' +
        '<div class="stage" style="aspect-ratio:' + state.viewport.width + '/' + state.viewport.height + '"><img class="shot" alt="Captured interface for ' + esc(title) + '" src="' + esc(state.screenshotDataUrl) + '" />' + stateSvg(state, matches) + '</div></details>';
    }).join("");
  }

  function coverageWarnings(data) {
    var missing = data.missingWidths || [];
    var truncated = data.summary?.truncated || 0;
    var coverage = missing.length ? '<p class="meta coverage-warning">Still to check: ' + esc(missing.map(function (width) { return width + "px"; }).join(", ")) + '. Capture these screen widths to finish the check.</p>' : "";
    var limit = truncated ? '<p class="meta analysis-warning">The check reached its finding limit. ' + esc(truncated) + ' more ' + (truncated === 1 ? 'issue was' : 'issues were') + ' left out. Fix the listed issues, then check again.</p>' : "";
    return coverage + limit;
  }

  function render(data) {
    if (!data || data.status === "needs-capture") {
      root.innerHTML = '<section class="message"><h1>No spacing measured yet</h1><p>Capture the page at the requested screen widths, then check its spacing.</p></section>';
      return;
    }
    var states = data.states || [];
    if (!states.length) {
      root.innerHTML = '<section class="message"><h1>No spacing measured yet</h1><p>Capture the page at one screen width to start the check.</p></section>';
      return;
    }
    var findings = data.findings || [];
    var groups = groupFindings(findings, states);
    var sections = findingSections(groups, states);
    var warnings = coverageWarnings(data);
    var captures = states.map(function (state) { return { state: state }; });
    root.innerHTML = '<header class="header"><h1>' + esc(resultTitle(groups.length, !!warnings)) + '</h1><p class="meta">Checked: ' + esc(captureContext(captures)) + '.</p>' + warnings + '</header>' +
      '<div class="body">' + sections.primary + sections.more + captureScreenshots(states, findings) + '</div>';
  }

  if (window.openai) {
    render(window.openai.toolOutput);
    window.addEventListener("openai:set_globals", function (event) {
      var globals = event && event.detail && event.detail.globals;
      render((globals && globals.toolOutput) || window.openai.toolOutput);
    });
  }

  try {
    var mcp = window.__bdMcp;
    if (mcp && mcp.App) {
      var app = new mcp.App({ name: "Better Design Spacing Inspection", version: "1.0.0" });
      app.ontoolresult = function (params) {
        var structured = params && (params.structuredContent || (params.result && params.result.structuredContent));
        if (structured) render(structured);
      };
      app.onhostcontextchanged = function (context) {
        try {
          if (context && context.theme) {
            document.documentElement.setAttribute("data-theme", context.theme);
            if (mcp.applyDocumentTheme) mcp.applyDocumentTheme(context.theme);
          }
        } catch (error) {}
      };
      if (app.connect) app.connect().catch(function () {});
    }
  } catch (error) {}
})();
</script>
</body>
</html>`;
