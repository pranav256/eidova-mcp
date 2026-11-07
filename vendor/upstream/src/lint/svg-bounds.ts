// Measures where an icon's glyph sits inside its own viewBox. The review needs
// one number from an icon file: how far the drawing's centre is from the box's
// centre. A curve or an arc is sampled, so the bounds are close enough for a
// review message, not for a renderer. [BD-1305]

/** The smallest box around every shape in an SVG, in viewBox units. */
export interface SvgBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A viewBox attribute, parsed. */
export interface SvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CURVE_SAMPLES = 16;
const NUMBER_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;
// The path commands. The letter e is not one: it belongs to a number such as 1e-5.
const COMMAND_RE = /[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi;

function extend(bounds: SvgBounds | null, x: number, y: number): SvgBounds {
  if (!bounds) return { minX: x, minY: y, maxX: x, maxY: y };
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
  return bounds;
}

function numbers(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

/**
 * The arguments of an arc command, read one by one. A minified path writes
 * the two flags without separators, as in `a2 2 0 104 0`, so each flag is one
 * character and never part of the number after it.
 */
function arcArguments(text: string): number[] {
  const out: number[] = [];
  const number = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/y;
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (i >= text.length) break;
    const position = out.length % 7;
    if (position === 3 || position === 4) {
      if (text[i] !== "0" && text[i] !== "1") break;
      out.push(Number(text[i]));
      i += 1;
      continue;
    }
    number.lastIndex = i;
    const match = number.exec(text);
    if (!match) break;
    out.push(Number(match[0]));
    i = number.lastIndex;
  }
  return out;
}

interface Point {
  x: number;
  y: number;
}

/** Samples a cubic Bézier and widens the bounds with each sample. */
function cubic(bounds: SvgBounds | null, p0: Point, p1: Point, p2: Point, p3: Point): SvgBounds {
  let out = extend(bounds, p0.x, p0.y);
  for (let i = 1; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    out = extend(out, x, y);
  }
  return out;
}

function quadratic(bounds: SvgBounds | null, p0: Point, p1: Point, p2: Point): SvgBounds {
  // A quadratic curve is the cubic with its two inner points raised.
  const c1 = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) };
  return cubic(bounds, p0, c1, c2, p2);
}

/**
 * Samples an elliptical arc by its endpoint form, the way the path syntax gives
 * it. The centre conversion follows the SVG implementation notes.
 */
function arc(
  bounds: SvgBounds | null,
  from: Point,
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): SvgBounds {
  let out = extend(bounds, from.x, from.y);
  out = extend(out, to.x, to.y);
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return out;
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return sign * Math.acos(Math.min(1, Math.max(-1, dot / len)));
  };
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  for (let i = 1; i < CURVE_SAMPLES; i++) {
    const theta = start + (delta * i) / CURVE_SAMPLES;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    out = extend(out, cos * ex - sin * ey + cx, sin * ex + cos * ey + cy);
  }
  return out;
}

/**
 * The bounds of one path's `d` attribute. Every command the path syntax
 * defines is read, absolute and relative alike. A path with no drawable point
 * returns null.
 */
export function svgPathBounds(d: string): SvgBounds | null {
  let bounds: SvgBounds | null = null;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastControl: Point | null = null;
  let lastCommand = "";
  const segments = d.match(COMMAND_RE) ?? [];
  for (const segment of segments) {
    const command = segment[0];
    const args = /a/i.test(command) ? arcArguments(segment.slice(1)) : numbers(segment.slice(1));
    const relative = command === command.toLowerCase();
    const point = (x: number, y: number): Point => (relative ? { x: current.x + x, y: current.y + y } : { x, y });
    const upper = command.toUpperCase();
    let i = 0;
    const takes = (count: number) => args.length - i >= count;
    const reflect = (kinds: string): Point => {
      if (lastControl && kinds.includes(lastCommand.toUpperCase())) {
        return { x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y };
      }
      return current;
    };
    if (upper === "Z") {
      current = start;
      lastControl = null;
      lastCommand = command;
      continue;
    }
    let first = true;
    while (true) {
      if (upper === "M" && takes(2)) {
        current = point(args[i], args[i + 1]);
        if (first) start = current;
        bounds = extend(bounds, current.x, current.y);
        lastControl = null;
        i += 2;
      } else if (upper === "L" && takes(2)) {
        current = point(args[i], args[i + 1]);
        bounds = extend(bounds, current.x, current.y);
        lastControl = null;
        i += 2;
      } else if (upper === "H" && takes(1)) {
        current = { x: relative ? current.x + args[i] : args[i], y: current.y };
        bounds = extend(bounds, current.x, current.y);
        lastControl = null;
        i += 1;
      } else if (upper === "V" && takes(1)) {
        current = { x: current.x, y: relative ? current.y + args[i] : args[i] };
        bounds = extend(bounds, current.x, current.y);
        lastControl = null;
        i += 1;
      } else if (upper === "C" && takes(6)) {
        const c1 = point(args[i], args[i + 1]);
        const c2 = point(args[i + 2], args[i + 3]);
        const end = point(args[i + 4], args[i + 5]);
        bounds = cubic(bounds, current, c1, c2, end);
        lastControl = c2;
        current = end;
        i += 6;
      } else if (upper === "S" && takes(4)) {
        const c1 = reflect("CS");
        const c2 = point(args[i], args[i + 1]);
        const end = point(args[i + 2], args[i + 3]);
        bounds = cubic(bounds, current, c1, c2, end);
        lastControl = c2;
        current = end;
        i += 4;
      } else if (upper === "Q" && takes(4)) {
        const c1 = point(args[i], args[i + 1]);
        const end = point(args[i + 2], args[i + 3]);
        bounds = quadratic(bounds, current, c1, end);
        lastControl = c1;
        current = end;
        i += 4;
      } else if (upper === "T" && takes(2)) {
        const c1 = reflect("QT");
        const end = point(args[i], args[i + 1]);
        bounds = quadratic(bounds, current, c1, end);
        lastControl = c1;
        current = end;
        i += 2;
      } else if (upper === "A" && takes(7)) {
        const end = point(args[i + 5], args[i + 6]);
        bounds = arc(bounds, current, args[i], args[i + 1], args[i + 2], args[i + 3] !== 0, args[i + 4] !== 0, end);
        lastControl = null;
        current = end;
        i += 7;
      } else {
        break;
      }
      first = false;
      lastCommand = command;
    }
  }
  return bounds;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{"([^"]*)"\\}|\\{'([^']*)'\\}|\\{\\s*(-?[\\d.]+(?:e[-+]?\\d+)?)\\s*\\})`,
    "i",
  ).exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]) : undefined;
}

function num(tag: string, name: string, fallback = 0): number {
  const value = attribute(tag, name);
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The bounds of every shape inside an `<svg>` element's markup: paths,
 * circles, ellipses, rects, lines, polylines and polygons. A `transform` on a
 * shape or a group is not applied, so a translated group reads as drawn. Null
 * when the markup draws nothing the review can measure.
 */
export function svgGlyphBounds(markup: string): SvgBounds | null {
  let bounds: SvgBounds | null = null;
  // A clip, a mask or a symbol is not drawn: a Figma export clips to the whole
  // box, which would centre every glyph.
  const drawn = markup.replace(/<(defs|clipPath|mask|symbol)\b[\s\S]*?<\/\1\s*>/gi, "");
  const tags = drawn.match(/<(?:path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    // A shape with no fill and no stroke of its own is a spacer, such as the
    // full-box path a Material icon starts with.
    if (attribute(tag, "fill") === "none" && attribute(tag, "stroke") === undefined) continue;
    const kind = /^<(\w+)/.exec(tag)?.[1]?.toLowerCase();
    if (kind === "path") {
      const d = attribute(tag, "d");
      const pathBounds = d ? svgPathBounds(d) : null;
      if (pathBounds) {
        bounds = extend(bounds, pathBounds.minX, pathBounds.minY);
        bounds = extend(bounds, pathBounds.maxX, pathBounds.maxY);
      }
    } else if (kind === "circle" || kind === "ellipse") {
      const cx = num(tag, "cx");
      const cy = num(tag, "cy");
      const rx = kind === "circle" ? num(tag, "r") : num(tag, "rx");
      const ry = kind === "circle" ? num(tag, "r") : num(tag, "ry");
      bounds = extend(bounds, cx - rx, cy - ry);
      bounds = extend(bounds, cx + rx, cy + ry);
    } else if (kind === "rect") {
      const x = num(tag, "x");
      const y = num(tag, "y");
      bounds = extend(bounds, x, y);
      bounds = extend(bounds, x + num(tag, "width"), y + num(tag, "height"));
    } else if (kind === "line") {
      bounds = extend(bounds, num(tag, "x1"), num(tag, "y1"));
      bounds = extend(bounds, num(tag, "x2"), num(tag, "y2"));
    } else {
      const points = numbers(attribute(tag, "points") ?? "");
      for (let i = 0; i + 1 < points.length; i += 2) bounds = extend(bounds, points[i], points[i + 1]);
    }
  }
  return bounds;
}

/** The `viewBox` of the first `<svg>` in the markup, or null when it has none. */
export function svgViewBox(markup: string): SvgViewBox | null {
  const svg = /<svg\b[^>]*>/i.exec(markup)?.[0];
  const raw = svg ? attribute(svg, "viewBox") : undefined;
  if (!raw) return null;
  const [x, y, width, height] = numbers(raw);
  if (![x, y, width, height].every((n) => Number.isFinite(n)) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** How far a glyph's centre sits from its viewBox centre: positive is right and down. */
export interface GlyphOffset {
  viewBox: SvgViewBox;
  bounds: SvgBounds;
  dx: number;
  dy: number;
}

/**
 * Measures the first `<svg>` in the markup. Null when it has no viewBox or no
 * measurable shape, which is not a fault the review can name.
 */
export function svgGlyphOffset(markup: string): GlyphOffset | null {
  const viewBox = svgViewBox(markup);
  const bounds = viewBox ? svgGlyphBounds(markup) : null;
  if (!viewBox || !bounds) return null;
  const dx = (bounds.minX + bounds.maxX) / 2 - (viewBox.x + viewBox.width / 2);
  const dy = (bounds.minY + bounds.maxY) / 2 - (viewBox.y + viewBox.height / 2);
  return { viewBox, bounds, dx, dy };
}
