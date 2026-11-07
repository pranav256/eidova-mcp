import { z } from "zod"

import { fetchCatalog } from "./catalog-tokens"
import { buildBlockPrompt, pageFromBlocks } from "./figma-model-blocks"
import { expandDrawings, frameDrawings } from "./figma-model-drawings"
import { LITERAL_COLOUR, type ModelDesignSystem, buildModelPrompt, currentColourPaint } from "./figma-model-prompt"
import type { ModelProvider } from "./figma-model-providers"
import { type PrototypeNode, type PrototypeReportEntry, escapeHtml } from "./figma-prototype"
import { PROTOTYPE_RUNTIME, PROTOTYPE_RUNTIME_HASH } from "./figma-prototype-runtime"
import { PROTOTYPE_STATE_CSS } from "./figma-prototype-style"
import { DS_KIT_CSS, compactTokensCss } from "./html-kit"
import { buildDsComponentCss } from "./preview-html"

/**
 * The model path of `create-figma-prototype`: a frame from a file that was not
 * built from a Better Design library goes to a model with the design
 * system's components, and the answer becomes one self-contained page plus a
 * report of every layer that did not make it. The tool writes the page's head
 * itself, so the model supplies markup and layout CSS but never a script.
 * [BD-866] The page still feels like the real product: the tool adds its own
 * fixed runtime script, which gives the model's `data-` attributes their
 * behaviour. [BD-1073]
 */

/** The model's answer, split into its parts. */
export interface ModelAnswer {
  /** The page markup, with any style and script elements taken out. */
  body: string
  /** The layout CSS from the answer's style elements. */
  css: string
  /** The layers the model says it could not place, or null when its list was unreadable. */
  unplaced: PrototypeReportEntry[] | null
}

const unplacedSchema = z.object({
  unplaced: z.array(z.object({ name: z.string(), reason: z.string() })),
})

function fenced(text: string, language: string): string | null {
  const match = text.match(new RegExp("```" + language + "[^\\n]*\\n([\\s\\S]*?)```", "i"))
  return match ? match[1] : null
}

function readUnplaced(text: string): PrototypeReportEntry[] | null {
  const json = fenced(text, "json") ?? text.match(/\{\s*"unplaced"[\s\S]*\}/)?.[0]
  if (!json) return null
  try {
    const parsed = unplacedSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data.unplaced : null
  } catch {
    // Not silent: null makes placementReport add a report line saying the
    // model's list was unreadable.
    return null
  }
}

/** Elements removed with their content: they run code or load another document. */
const UNSAFE_BLOCKS = /<(script|iframe|object|embed|noscript)\b[\s\S]*?(<\/\1[^>]*>|$)/gi
/**
 * Tags removed on their own: they navigate, load or open a second style
 * sheet. A tag left open at the end counts too, because the wrapper's
 * closing tag would otherwise finish it.
 */
const UNSAFE_TAGS = /<\/?(meta|link|base|style)\b[^>]*(>|$)/gi
/** A form tag, open or closing, also when left open at the end. */
const FORM_TAG = /<(\/?)form\b([^>]*)(>|$)/gi
/** The form attributes that only name or describe it; action, method and target go. */
const FORM_KEPT_ATTRIBUTE = /^(class|id|role|aria-[\w-]+|data-[\w-]+)$/i

/**
 * A form tag as a div. A form submits and navigates, so it cannot stay, but
 * its class carries the layout the model wrote for it, such as a full-width
 * column of fields. Keeping only the naming attributes keeps that layout.
 */
function formAsDiv(_tag: string, closing: string, attributes: string): string {
  if (closing) return "</div>"
  const kept: string[] = []
  for (const attribute of attributes.matchAll(ATTRIBUTE_IN_TAG)) {
    if (FORM_KEPT_ATTRIBUTE.test(attribute[1])) kept.push(`${attribute[1]}${attribute[2] ?? ""}`)
  }
  return `<div${kept.map((attribute) => ` ${attribute}`).join("")}>`
}

/**
 * The markup without anything that could act when the page opens. The page's
 * policy already blocks scripts and requests, but a meta refresh or a form
 * still navigates under it, so the refresh goes and a form becomes a div.
 * The pass repeats until nothing changes, because removing one tag can join
 * the pieces of another.
 */
function withoutUnsafeMarkup(html: string): string {
  let previous = ""
  let current = html
  while (current !== previous) {
    previous = current
    current = current.replace(UNSAFE_BLOCKS, "").replace(UNSAFE_TAGS, "").replace(FORM_TAG, formAsDiv).replace(/<[a-z](?:[^>"']|"[^"]*"|'[^']*')*>/gi, withoutHandlers)
  }
  return current
}

const ATTRIBUTE_IN_TAG = /[\s/]*([^\s"'>/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g

/**
 * A start tag without its `on...=` handler attributes. The tag is read one
 * attribute at a time, quoted values whole, so a value that merely contains
 * "on" stays and a handler right after a closing quote still goes. The page's
 * policy already refuses to run handlers; taking them out means the page never
 * even carries code the model wrote. [BD-1073]
 */
function withoutHandlers(tag: string): string {
  const match = tag.match(/^<([a-z][^\s/>]*)([\s\S]*?)(\/?)>$/i)
  if (!match) return tag
  const kept: string[] = []
  for (const attribute of match[2].matchAll(ATTRIBUTE_IN_TAG)) {
    if (/^on[a-z]+$/i.test(attribute[1])) continue
    kept.push(`${attribute[1]}${attribute[2] ?? ""}`)
  }
  return `<${match[1]}${kept.map((attribute) => ` ${attribute}`).join("")}${match[3]}>`
}

/** Splits a model's reply into markup, layout CSS and its unplaced-layer list. */
export function parseModelAnswer(text: string): ModelAnswer {
  let html = fenced(text, "html")
  if (html === null) {
    // No fence: take everything from the first tag to the last, before any JSON block.
    const beforeJson = text.split(/```json/i)[0]
    const start = beforeJson.indexOf("<")
    const end = beforeJson.lastIndexOf(">")
    html = start >= 0 && end > start ? beforeJson.slice(start, end + 1) : ""
  }
  const styles: string[] = []
  let body = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style[^>]*>/gi, (_, css: string) => {
    styles.push(css.trim())
    return ""
  })
  const inner = body.match(/<body\b[^>]*>([\s\S]*?)(<\/body\s*>|$)/i)
  if (inner) body = inner[1]
  body = body
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<\/?(html|body)\b[^>]*>/gi, "")
  return { body: withoutUnsafeMarkup(body).trim(), css: styles.filter(Boolean).join("\n"), unplaced: readUnplaced(text) }
}

const COLOUR_PROPERTY = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(-color)?|caret-color|accent-color)$/

/** Whether a value holds a colour of its own; `var(--blue)` names a token, not a colour. */
function hasLiteralColour(value: string): boolean {
  return value.replace(/var\(\s*--[\w-]+\s*\)/g, "").match(LITERAL_COLOUR) !== null
}

/** One declaration list with the model's own colours taken out, and how many went. */
function themeDeclarations(list: string, systemTokens: ReadonlySet<string>) {
  let removed = 0
  const kept = list.split(";").flatMap((declaration) => {
    const colon = declaration.indexOf(":")
    if (colon < 0) return declaration.trim() ? [declaration] : []
    const property = declaration.slice(0, colon).trim().toLowerCase()
    const value = declaration.slice(colon + 1)
    // A variable of the model's own that only points at tokens carries the
    // system's colour, so it stays. One that holds a literal colour, or that
    // redefines one of the system's tokens, goes. [BD-1162]
    const custom = property.startsWith("--")
    const redefinesToken = custom && systemTokens.has(property)
    if (!redefinesToken && (!hasLiteralColour(value) || (!custom && !COLOUR_PROPERTY.test(property)))) return [declaration]
    removed += 1
    // A border keeps its width and style and takes the system's border colour.
    if (/^(border|outline)/.test(property)) return [`${property}:${value.replace(LITERAL_COLOUR, "var(--border)")}`]
    return []
  })
  return { text: kept.join(";"), removed }
}

/**
 * The answer with every colour the model wrote itself taken out: literal
 * colours in its stylesheet and style attributes, and any token it tried to
 * redefine: a `:root` block, or a variable named like one in `tokensCss`.
 * Its own variables that only point at tokens stay. The design system's own
 * stylesheet then colours the page, so the
 * page follows the system's theme even when the model ignored the rule. The
 * count goes in the report. [BD-866]
 */
export function stripOwnColours(answer: Pick<ModelAnswer, "body" | "css">, tokensCss = "") {
  let removed = 0
  const systemTokens = new Set(Array.from(tokensCss.matchAll(/(--[\w-]+)\s*:/g), (match) => match[1].toLowerCase()))
  const theme = (list: string) => {
    const themed = themeDeclarations(list, systemTokens)
    removed += themed.removed
    return themed.text
  }
  const css = answer.css
    .replace(/:root\s*\{[^{}]*\}/g, () => {
      removed += 1
      return ""
    })
    .replace(/\{([^{}]*)\}/g, (_, list: string) => `{${theme(list)}}`)
  const styled = answer.body
    .replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_, prefix: string, mark: string, list: string) => `${prefix}${mark}${theme(list)}${mark}`)
    .replace(/(\sstyle\s*=\s*)([^\s"'>]+)/gi, (_, prefix: string, list: string) => `${prefix}${theme(list)}`)
  const painted = currentColourPaint(styled)
  return { body: painted.text, css, removed: removed + painted.replaced }
}

const ENTITIES = new Map([["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"], ["nbsp", " "]])

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, name: string) => {
    const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : name.startsWith("#") ? Number(name.slice(1)) : Number.NaN
    if (Number.isInteger(code) && code > 0 && code <= 0x10ffff) return String.fromCodePoint(code)
    return ENTITIES.get(name.toLowerCase()) ?? entity
  })
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase()
}

/** The text a reader sees on the page, lower-cased with whitespace collapsed. */
function visibleText(body: string): string {
  const text = body.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ").replace(/<[^>]+>/g, " ")
  return normalize(decodeEntities(text))
}

/** How many times `words` appears in `text`, without overlaps. */
function occurrences(text: string, words: string): number {
  if (!words) return 0
  let count = 0
  for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + words.length)) count += 1
  return count
}

/** How many elements on the page carry each `data-layer` name. */
function layerMarks(body: string): Map<string, number> {
  const marks = new Map<string, number>()
  for (const match of body.matchAll(/data-layer\s*=\s*"([^"]*)"/gi)) {
    const name = decodeEntities(match[1])
    marks.set(name, (marks.get(name) ?? 0) + 1)
  }
  return marks
}

/**
 * Every layer that did not reach the page, from three sources: the model's
 * own list, a text layer whose words the page does not show, and a drawing or
 * instance nothing on the page is marked as. Layers cut from the prompt are
 * reported once, by the prompt, and are not checked again.
 */
export function placementReport(
  frame: PrototypeNode,
  body: string,
  unplaced: PrototypeReportEntry[] | null,
  omitted: PrototypeReportEntry[] = [],
): PrototypeReportEntry[] {
  const report: PrototypeReportEntry[] = [...omitted]
  // A layer the prompt cut or the model named is reported once, with that
  // reason, and not checked again.
  const declared = new Set(omitted.map((entry) => entry.name))
  const add = (entry: PrototypeReportEntry) => {
    if (!report.some((line) => line.name === entry.name && line.reason === entry.reason)) report.push(entry)
  }
  if (unplaced === null) add({ name: frame.name, reason: "the model returned no readable list of the layers it left out" })
  for (const entry of unplaced ?? []) {
    if (declared.has(entry.name)) continue
    declared.add(entry.name)
    add({ name: entry.name, reason: `the model left it out: ${entry.reason}` })
  }

  const page = visibleText(body)
  // Figma repeats names ("Icon", "Vector"), so drawings and instances are
  // counted per name and compared with the marks the page carries.
  const layers = new Map<string, { kind: string; count: number }>()
  // A text the frame repeats, such as eight "REQ ID" cards, must appear as
  // often on the page, or the model is told how many it dropped. [BD-1164]
  const texts = new Map<string, { name: string; characters: string; count: number }>()
  const walk = (node: PrototypeNode) => {
    if (node.kind === "frame") {
      if (!omitted.some((entry) => entry.name === node.name)) node.children.forEach(walk)
      return
    }
    if (declared.has(node.name)) return
    if (node.kind === "text") {
      const words = normalize(node.characters)
      if (!words) return
      const seen = texts.get(words)
      texts.set(words, { name: seen?.name ?? node.name, characters: seen?.characters ?? node.characters, count: (seen?.count ?? 0) + 1 })
      return
    }
    const kind = node.kind === "shape" ? "drawing" : "instance"
    const seen = layers.get(node.name)
    layers.set(node.name, { kind, count: (seen?.count ?? 0) + 1 })
  }
  walk(frame)
  for (const [words, { name, characters, count }] of texts) {
    const shown = occurrences(page, words)
    if (shown >= count) continue
    const quoted = characters.slice(0, 80)
    add({
      name,
      reason: shown === 0
        ? `its text "${quoted}" is not on the page`
        : `the frame shows "${quoted}" ${count} times and the page ${shown}`,
    })
  }

  const marks = layerMarks(body)
  for (const [name, { kind, count }] of layers) {
    const marked = marks.get(name) ?? 0
    if (marked >= count) continue
    add({
      name,
      reason: count === 1
        ? `no element on the page is marked as this ${kind}`
        : `${count - marked} of the ${count} ${kind}s with this name are not marked on the page`,
    })
  }
  return report
}

/** Input types a browser draws itself, which the system does not restyle. */
const NATIVE_INPUTS = new Set(["checkbox", "radio", "hidden", "range", "file", "color"])
const CONTROLS = new Set(["button", "select", "textarea", "input"])
const CARD_PARTS = ["ds-card-header", "ds-card-body", "ds-card-footer"]
// `[^<>]*` stops at the next `<`, and the name may not hand letters back to
// the attributes, so an unclosed tag costs one pass: the answer file can be
// 2 MB. [BD-1145]
const OPENING_TAG = /<([a-zA-Z][\w-]*)(?![\w-])([^<>]*)>/g

/**
 * The classes the page's own CSS styles, and those it pads. Each block is read
 * once and the sheet is split on braces rather than matched, so a 2 MB sheet
 * costs one pass. [BD-1145]
 */
function classRules(css: string) {
  const styled = new Set<string>()
  const padded = new Set<string>()
  for (const block of css.split("}")) {
    const open = block.lastIndexOf("{")
    if (open < 0) continue
    const pads = /(^|;)\s*padding/.test(block.slice(open + 1))
    for (const [, name] of block.slice(0, open).matchAll(/\.([\w-]+)/g)) {
      styled.add(name)
      if (pads) padded.add(name)
    }
  }
  return { styled, padded }
}

/** One attribute's value, quoted either way; `data-class` is not `class`. */
function attribute(attributes: string, name: string): string {
  const match = new RegExp(`(?:^|\\s)${name}\\s{0,2}=\\s{0,2}(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`, "i").exec(attributes)
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : ""
}

/** The control attributes that name another element, and what that element must be. */
const CONTROL_TARGETS = [
  { attribute: "popovertarget", needs: "popover" },
  { attribute: "data-dialog-open", needs: "dialog" },
  { attribute: "data-toggle", needs: "element" },
  { attribute: "data-toggle-open", needs: "element" },
] as const

type ControlTarget = (typeof CONTROL_TARGETS)[number]

/**
 * Controls whose target is missing or the wrong kind of element, which do
 * nothing when clicked: a `popovertarget` needs a `popover`, a
 * `data-dialog-open` a `<dialog>`. [BD-1145]
 */
function wiringReport(targets: Map<string, { tag: string; popover: boolean }>, refs: Array<{ control: ControlTarget; id: string }>): PrototypeReportEntry[] {
  const broken = new Map<string, string[]>()
  for (const { control, id } of refs) {
    const target = targets.get(id)
    const ok = target !== undefined && (control.needs === "element" || (control.needs === "popover" ? target.popover : target.tag === "dialog"))
    if (ok) continue
    const ids = broken.get(control.attribute) ?? []
    ids.push(id)
    broken.set(control.attribute, ids)
  }
  return [...broken].map(([name, ids]) => ({
    name,
    reason: `${ids.length} control(s) point at a missing or wrong target (${ids.slice(0, 3).map((id) => JSON.stringify(id.slice(0, 40))).join(", ")}), so clicking them does nothing`,
  }))
}

/**
 * Markup that skips the system's parts, which no layer check sees: a control
 * with neither a `ds-*` class nor a class the page styles renders as the
 * browser's default, and a card's content
 * outside its header, body and footer sits against the border, because
 * `ds-card` carries no padding of its own. [BD-1145]
 */
export function partsReport(body: string, css = ""): PrototypeReportEntry[] {
  const rules = classRules(css)
  const padded = (names: string[]) => names.some((name) => rules.padded.has(name))
  const bare = new Map<string, number>()
  let loose = 0
  let card: { end: number } | null = null
  const targets = new Map<string, { tag: string; popover: boolean }>()
  const refs: Array<{ control: ControlTarget; id: string }> = []
  for (const match of body.matchAll(OPENING_TAG)) {
    const tag = match[1].toLowerCase()
    const classes = attribute(match[2], "class").split(/\s+/)
    const id = attribute(match[2], "id")
    if (id) targets.set(id, { tag, popover: /(?:^|\s)popover(?=[\s=/]|$)/i.test(match[2]) })
    for (const control of CONTROL_TARGETS) {
      const target = attribute(match[2], control.attribute)
      if (target) refs.push({ control, id: target })
    }
    if (card) {
      // A card's first child must be one of its parts, with nothing but space before it.
      const between = body.slice(card.end, match.index)
      // An empty card closes first, and holds nothing to pad.
      const empty = between.trim().startsWith("</")
      if (!empty && (between.trim() || !classes.some((name) => CARD_PARTS.includes(name)))) loose += 1
      card = null
    }
    // A card that pads itself through its own class is not loose.
    if (classes.includes("ds-card") && !padded(classes)) card = { end: match.index + match[0].length }
    if (!CONTROLS.has(tag)) continue
    if (tag === "input" && NATIVE_INPUTS.has(attribute(match[2], "type").toLowerCase())) continue
    // A class the page's own CSS styles replaces the browser's default look.
    if (classes.some((name) => name.startsWith("ds-") || rules.styled.has(name))) continue
    bare.set(`<${tag}>`, (bare.get(`<${tag}>`) ?? 0) + 1)
  }
  const report: PrototypeReportEntry[] = [...bare].map(([name, count]) => ({
    name,
    reason: `${count} on the page carry no ds-* class and no class the page styles, so they render as browser defaults`,
  }))
  report.push(...wiringReport(targets, refs))
  if (loose) {
    report.push({
      name: "ds-card",
      reason: `${loose} card(s) hold content outside ds-card-header, ds-card-body and ds-card-footer, so it has no padding`,
    })
  }
  return report
}

/**
 * How many frames in the tree were drawn from each client component. A
 * subtree the prompt cut never reached the model and is already reported, so
 * it is skipped, the way `placementReport` skips it.
 */
function clientComponents(node: PrototypeNode, omitted: ReadonlySet<string>, counts = new Map<string, number>()): Map<string, number> {
  if (node.kind !== "frame" || omitted.has(node.name)) return counts
  if (node.component) counts.set(node.component, (counts.get(node.component) ?? 0) + 1)
  for (const child of node.children) clientComponents(child, omitted, counts)
  return counts
}

const DATA_PART = /\bdata-part\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/**
 * Client components the page did not keep as named parts [BD-1056]. Each
 * frame the plugin drew from a client component should come back as an
 * element with `data-part` set to that component's name; a page with fewer
 * lost the link to the client's own component.
 */
export function namedPartsReport(frame: PrototypeNode, body: string, omitted: PrototypeReportEntry[] = []): PrototypeReportEntry[] {
  const wanted = clientComponents(frame, new Set(omitted.map((entry) => entry.name)))
  if (!wanted.size) return []
  const kept = new Map<string, number>()
  for (const match of body.matchAll(DATA_PART)) {
    const name = decodeEntities(match[1] ?? match[2] ?? "")
    kept.set(name, (kept.get(name) ?? 0) + 1)
  }
  const report: PrototypeReportEntry[] = []
  for (const [component, count] of wanted) {
    const missing = count - (kept.get(component) ?? 0)
    if (missing > 0) {
      report.push({ name: component, reason: `${missing} of ${count} on the page lost the client component's name: no element carries data-part for it` })
    }
  }
  return report
}

/**
 * Blocks every script and every request except the fonts a token sheet may
 * import. The model wrote the markup, so the page must not run anything it
 * wrote even if a script slipped past the parser. The one script allowed is
 * the tool's own runtime, named by its hash, so a script or handler the model
 * wrote never runs. [BD-1073]
 */
export const MODEL_PAGE_CSP = `default-src 'none'; script-src '${PROTOTYPE_RUNTIME_HASH}'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; form-action 'none'; base-uri 'none'`

/**
 * The kit's variant rules the system's component sheet does not define. That
 * sheet comes later and its base rule wins at equal specificity, so without
 * these a `ds-badge-safe` chip turned grey. [BD-1145]
 */
function kitVariantsAfter(componentCss: string): string {
  return DS_KIT_CSS.split("\n")
    .filter((line) => {
      const variant = /^\.(ds-[a-z]+-[a-z0-9-]+)\{/.exec(line)?.[1]
      return variant !== undefined && !componentCss.includes(`.${variant}`)
    })
    .join("\n")
}

/**
 * Wraps the model's markup in one self-contained document the tool controls.
 * The system's stylesheet (tokens, the kit, then this system's material) comes
 * before the model's layout CSS. Every page passes through here, so the last
 * guard sits here too: the body is cleaned again after any rewrite since
 * parsing, and the CSS loses every `<`, which it never needs and which is the
 * only way out of its element.
 */
export function modelPrototypeDocument(input: { title: string; system: ModelDesignSystem; css: string; body: string }): string {
  const { system } = input
  const css = input.css.replace(/</g, "")
  const body = withoutUnsafeMarkup(input.body)
  const kitCss = [compactTokensCss(system.tokensCss), DS_KIT_CSS, system.componentCss, system.componentCss ? kitVariantsAfter(system.componentCss) : ""].filter(Boolean).join("\n")
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${MODEL_PAGE_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${kitCss}</style>`,
    `<style>${css}</style>`,
    // Media stays inside its box, so a drawing never pushes a phone screen sideways. [BD-1075]
    // A kit class such as `.ds-card{display:flex}` beats the browser's own rule that hides a closed menu, so the page restates it. [BD-1056]
    `<style>html,body{margin:0}.ds{min-height:100vh}.ds img,.ds video{max-width:100%;height:auto}.ds svg{max-width:100%}[popover]:not(:popover-open),[hidden]{display:none!important}${PROTOTYPE_STATE_CSS}</style>`,
    "</head>",
    "<body>",
    `<div class="ds" data-ds="${escapeHtml(system.id)}">${body}</div>`,
    `<script>${PROTOTYPE_RUNTIME}</script>`,
    "</body>",
    "</html>",
  ].join("\n")
}

/** A catalog design system as the model path needs it, or null when the registry has no such system. */
export async function loadModelDesignSystem(id: string): Promise<ModelDesignSystem | null> {
  const { tokensCss, files } = await fetchCatalog(id)
  if (!tokensCss) return null
  return { id, name: id, tokensCss, componentCss: buildDsComponentCss(files).css }
}

/** What one model run produced. */
export interface ModelPrototypeResult {
  html: string
  report: PrototypeReportEntry[]
  durationMs: number
  inputTokens?: number
  outputTokens?: number
}

/** A prompt shorter than this share of its own length in tokens was cut by the server's context window. */
const CONTEXT_CUT_RATIO = 0.5

/**
 * Turns a model's reply into the finished page and its report. Both paths end
 * here: the calling agent's answer file and a local model's reply. Throws when
 * the reply holds no markup, since an empty page with a clean report would
 * read as success. `author` names who wrote the reply in the report;
 * `warnings` are lines about the run that lead it.
 */
export function pageFromReply(input: {
  frame: PrototypeNode
  designSystem: ModelDesignSystem
  text: string
  author: string
  omitted: PrototypeReportEntry[]
  warnings?: string[]
}) {
  const { frame, author } = input
  const answer = parseModelAnswer(input.text)
  if (!answer.body) throw new Error(`${author} returned no HTML for "${frame.name}".`)
  const themed = stripOwnColours(answer, input.designSystem.tokensCss)
  const drawn = expandDrawings(themed.body, frameDrawings(frame), frame.name)
  const warnings = [...(input.warnings ?? [])]
  if (themed.removed) {
    warnings.push(`${author} wrote ${themed.removed} colour value(s) of its own; the tool removed them so the page takes the system's colours`)
  }
  const report = [
    ...warnings.map((reason) => ({ name: frame.name, reason })),
    ...drawn.report,
    ...placementReport(frame, drawn.text, answer.unplaced, input.omitted),
    ...partsReport(drawn.text, themed.css),
    ...namedPartsReport(frame, drawn.text, input.omitted),
  ]
  const html = modelPrototypeDocument({ title: frame.name, system: input.designSystem, css: themed.css, body: drawn.text })
  return { html, report }
}

/** Sends the frame to a local model and turns its reply into a page and a report. */
export async function renderPrototypeWithModel(input: {
  frame: PrototypeNode
  png?: string
  designSystem: ModelDesignSystem
  provider: ModelProvider
  signal?: AbortSignal
  /** "blocks" asks only for the client components on a page code drew. [BD-1299] */
  method?: "page" | "blocks"
}): Promise<ModelPrototypeResult> {
  const { frame, provider } = input
  const blocks = input.method === "blocks"
  const prompt = blocks ? buildBlockPrompt(input) : buildModelPrompt(input)
  const started = Date.now()
  const reply = await provider.complete(prompt, { signal: input.signal })
  const durationMs = Date.now() - started
  const warnings: string[] = []
  // A local server can cut the prompt to its context window without saying
  // so. About four characters make a token, so a reported prompt far smaller
  // than that means the model never read the end of the outline.
  const estimate = (prompt.system.length + prompt.text.length) / 4
  if (reply.inputTokens !== undefined && reply.inputTokens < estimate * CONTEXT_CUT_RATIO) {
    warnings.push(`${provider.model} read ${reply.inputTokens} prompt tokens of about ${Math.round(estimate)}; raise its context length`)
  }
  if (reply.truncated) warnings.push(`${provider.model} ran out of output room, so the page may stop part way`)
  const page = blocks
    ? pageFromBlocks({ frame, designSystem: input.designSystem, text: reply.text, author: provider.model, warnings })
    : pageFromReply({ frame, designSystem: input.designSystem, text: reply.text, author: provider.model, omitted: prompt.omitted, warnings })
  return { ...page, durationMs, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens }
}
