import type { Finding, LintInput } from "./types";

function rgb(value: string): [number, number, number] | null {
  const color = value.trim();
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map(char => char + char).join("") : hex;
    return [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16)) as [number, number, number];
  }
  const channels = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(1(?:\.0*)?))?\s*\)$/i);
  if (!channels) return null;
  const values = channels.slice(1, 4).map(Number);
  return values.every(channel => channel <= 255) ? values as [number, number, number] : null;
}

function luminance(color: [number, number, number]): number {
  const channels = color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function ratio(first: string, second: string): number | null {
  const a = rgb(first), b = rgb(second);
  if (!a || !b) return null;
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function explicitContrastFindings(input: LintInput): Finding[] {
  const source = input.content.replace(/\/\*[\s\S]*?\*\//g, value => value.replace(/[^\r\n]/g, " "));
  const findings: Finding[] = [];
  for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, { value: string; offset: number; important: boolean }>();
    for (const declaration of block[2].matchAll(/(?:^|;)\s*(color|background(?:-color)?|font-size|font-weight)\s*:\s*([^;{}]+?)(?=;|$)/gi)) {
      const name = declaration[1].toLowerCase().replace(/^background$/, "background-color");
      const important = /\s*!important\s*$/i.test(declaration[2]);
      if (declarations.get(name)?.important && !important) continue;
      declarations.set(name, { value: declaration[2].replace(/\s*!important\s*$/i, "").trim(), important, offset: (block.index ?? 0) + block[1].length + 1 + (declaration.index ?? 0) + declaration[0].indexOf(declaration[1]) });
    }
    const foreground = declarations.get("color"), background = declarations.get("background-color") ?? declarations.get("background");
    if (!foreground || !background) continue;
    const value = ratio(foreground.value, background.value);
    const size = declarations.get("font-size")?.value.match(/^(\d+(?:\.\d+)?)px$/)?.[1];
    const weight = declarations.get("font-weight")?.value;
    const large = size && (Number(size) >= 24 || Number(size) >= 18.667 && (weight === "bold" || Number(weight) >= 700));
    // shortcut: only local opaque hex/rgb pairs and explicit pixel text sizes; resolve cascade and other formats in the browser.
    const minimum = large ? 3 : 4.5;
    if (value === null || value >= minimum) continue;
    const line = source.slice(0, foreground.offset).split("\n").length;
    findings.push({
      file: input.path,
      line,
      severity: "serious",
      ruleId: "wcag/explicit-contrast",
      wcag: "1.4.3 (AA)",
      snippet: input.content.split(/\r?\n/)[line - 1]?.trim() ?? "",
      message: `Explicit declarations specify ${foreground.value} on ${background.value}, a ${value.toFixed(2)}:1 contrast ratio, below ${minimum}:1 for ${large ? "explicit large" : "normal-size"} text. Rendered size, cascade and colors remain unverified.`,
      fix: `Choose a foreground/background token pair with at least ${minimum}:1 contrast, then verify the rendered computed colors and text size.`,
      kind: "measured-source",
    });
  }
  return findings;
}
