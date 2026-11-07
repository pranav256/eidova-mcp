import type { PrototypeNode, PrototypeReportEntry } from "./figma-prototype"

/**
 * Each distinct drawing in a frame, sent to the model once and named by a
 * short id. A Figma screen repeats the same icon hundreds of times: Matrix's
 * Risks frame had 295 vector layers but 100 distinct drawings, and the model
 * copied the paths back into its page, which made SVG half of its answer. Now
 * the outline names the id, the model writes `<svg data-svg="s3"></svg>`, and
 * the tool puts the paths back when it builds the page. [BD-1074]
 */

/**
 * A literal CSS colour: hex, a colour function, or a named colour a model
 * reaches for. A function's body may hold one inner call, such as `calc()` or
 * `var()`, and stops at a second opener, so an unclosed `rgb(rgb(` chain costs
 * one short scan per opener, not one to the end. [BD-1153]
 */
export const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\((?:[^()]|\([^()]*\))*\)|\b(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal|maroon|olive|lime|aqua|fuchsia|brown|gold|indigo|violet|cyan|magenta|beige|crimson|coral|salmon|tomato|khaki|lavender|plum|tan|turquoise)\b/gi

/**
 * SVG paint attributes with a literal colour become `currentColor`, so a
 * drawing takes the colour of the text around it, which the system sets.
 * Figma exports every fill and stroke as a literal, and on a dark system a
 * dark icon copied as it is disappears. A gradient reference is left alone.
 */
export function currentColourPaint(markup: string) {
  let replaced = 0
  const text = markup.replace(/(\s(?:fill|stroke|stop-color|color)\s*=\s*)(["'])([^"']*)\2/gi, (whole, prefix: string, mark: string, value: string) => {
    if (/^\s*url\(/i.test(value) || !value.match(LITERAL_COLOUR)) return whole
    replaced += 1
    return `${prefix}${mark}currentColor${mark}`
  })
  return { text, replaced }
}

/**
 * A drawing's SVG travels to the model only below this length. A bigger one
 * still gets an id and goes on the page: the model reads its size, never its
 * paths, the way it reads a picture. Before, it got no id, and Matrix's
 * ellipsis icon came out empty. [BD-1270]
 */
export const INLINE_SVG_LIMIT = 1_200

/**
 * A picture: one embedded bitmap and nothing else, which the plugin sends for
 * vector artwork whose layers cannot travel one by one. It goes by id at any
 * size, and the model sees its size, never its bytes. [BD-1145]
 */
/** The only attributes a picture's `<image>` may carry: a link, its box and its fit. */
const PICTURE_ATTRIBUTES = new Set(["href", "width", "height", "x", "y", "preserveaspectratio"])
// One attribute at a time, from where the last one ended: each step reads
// forward only, so a crafted tag costs one pass. [BD-1145]
const PICTURE_ATTRIBUTE = /\s+([\w:-]+)="([^"]*)"/y
const BASE64_PNG = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/

/** The largest picture kept, in characters: a 2x export of a full screen fits well inside. */
export const PICTURE_LIMIT = 8_000_000

/** Whether a drawing is a picture the tool fills in, rather than paths the model may read. */
export function isPicture(svg: string): boolean {
  if (svg.length > PICTURE_LIMIT || !svg.startsWith("<svg") || !svg.endsWith("</svg>")) return false
  const open = svg.indexOf(">")
  const image = svg.indexOf("<image", open)
  if (open < 0 || image < 0 || svg.slice(open + 1, image).trim()) return false
  let at = image + "<image".length
  let href = ""
  for (;;) {
    PICTURE_ATTRIBUTE.lastIndex = at
    const match = PICTURE_ATTRIBUTE.exec(svg)
    if (!match) break
    if (!PICTURE_ATTRIBUTES.has(match[1].toLowerCase())) return false
    if (match[1] === "href") {
      // A second link could point the picture somewhere else. [BD-1145]
      if (href) return false
      href = match[2]
    }
    at = PICTURE_ATTRIBUTE.lastIndex
  }
  const rest = svg.slice(at).replace(/^\s*\/>/, "")
  return rest !== svg.slice(at) && rest.trim() === "</svg>" && BASE64_PNG.test(href)
}

/** Every distinct literal colour a drawing paints with, read from its paint attributes. */
function paintColours(markup: string): Set<string> {
  const colours = new Set<string>()
  for (const match of markup.matchAll(/\s(?:fill|stroke|stop-color|color)\s*=\s*(["'])([^"']*)\1/gi)) {
    const value = match[2].trim().toLowerCase()
    if (!/^\s*url\(/i.test(value) && value.match(LITERAL_COLOUR)) colours.add(value)
  }
  return colours
}

/**
 * The drawing as the model and the page see it: whitespace folded, and a
 * one-colour drawing's paint as currentColor, so a glyph takes the text colour
 * the system sets. A drawing of two colours or more keeps its own: Matrix's
 * coloured folder tiles came out as black squares and its gradient logo grey.
 * [BD-1275]
 */
export function drawingSvg(svg: string): string {
  const folded = svg.replace(/\s+/g, " ").trim()
  return paintColours(folded).size > 1 ? folded : currentColourPaint(folded).text
}

/**
 * Every distinct drawing in the frame, keyed by its SVG and numbered in
 * reading order. The outline and the page both read this one map, so a cut
 * outline can never shift an id the page relies on.
 */
export function frameDrawings(frame: PrototypeNode): Map<string, string> {
  const ids = new Map<string, string>()
  const walk = (node: PrototypeNode) => {
    if (node.kind === "shape") {
      const svg = drawingSvg(node.svg)
      if (!ids.has(svg)) ids.set(svg, `s${ids.size + 1}`)
    }
    if (node.kind === "frame") node.children.forEach(walk)
  }
  walk(frame)
  return ids
}

const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/**
 * The attributes of one start tag's inside, in order, keyed by lower-case name
 * but keeping each name as written: SVG names such as `viewBox` are
 * case-sensitive.
 */
function attributes(inside: string): Map<string, { name: string; value: string }> {
  const found = new Map<string, { name: string; value: string }>()
  for (const match of inside.matchAll(ATTRIBUTE)) {
    found.set(match[1].toLowerCase(), { name: match[1], value: match[2] ?? match[3] ?? match[4] ?? "" })
  }
  return found
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

/**
 * The page with each `<svg data-svg="sN">` replaced by drawing N. The stored
 * drawing gives the paths and the viewBox; the model's own attributes (its
 * class, size, style and data-layer) win over the drawing's, so the model still
 * places and sizes the icon. A reference to an id the frame does not have is
 * left as it is and reported.
 */
export function expandDrawings(body: string, drawings: Map<string, string>, frameName: string) {
  const byId = new Map<string, string>()
  for (const [svg, id] of drawings) byId.set(id, svg)
  const report: PrototypeReportEntry[] = []
  const unknown = new Set<string>()
  // The self-closing form goes first: tried second, `<svg ...>` would also match
  // `<svg data-svg="s1"/>` and run on to the next `</svg>` on the page,
  // overwriting everything in between.
  const text = body.replace(/<svg\b([^>]*?)\/>|<svg\b([^>]*)>([\s\S]*?)<\/svg\s*>/gi, (whole, selfClosed?: string, open?: string) => {
    const own = attributes(open ?? selfClosed ?? "")
    const id = own.get("data-svg")?.value
    if (!id) return whole
    const stored = byId.get(id)
    if (!stored) {
      unknown.add(id)
      return whole
    }
    const start = stored.match(/^<svg\b([^>]*)>/i)
    const inner = stored.replace(/^<svg\b[^>]*>/i, "").replace(/<\/svg\s*>\s*$/i, "")
    const merged = attributes(start?.[1] ?? "")
    for (const [key, attribute] of own) merged.set(key, attribute)
    const tag = [...merged.values()].map(({ name, value }) => `${name}="${escapeAttribute(value)}"`)
    return `<svg ${tag.join(" ")}>${inner}</svg>`
  })
  for (const id of unknown) {
    report.push({ name: frameName, reason: `the page names drawing ${id}, which the frame does not have, so that icon is empty` })
  }
  return { text, report }
}
