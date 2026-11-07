import { createHash } from "node:crypto"

import { z } from "zod"

/**
 * Sends a rebuilt page back to Figma [BD-1056]. Figma cannot read HTML, and
 * the plugin's sandbox has no layout engine, so the page measures itself: the
 * panel renders it in a sandboxed frame, the script below walks the rendered
 * boxes, and the plugin draws the tree it posts. An element with `data-part`
 * becomes an instance of the client's component of that name.
 */

const rgbaSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

/** RGBA, each channel 0 to 1, as Figma paints take it. */
type Rgba = z.infer<typeof rgbaSchema>

const drawNodeBase = z.object({
  t: z.enum(["frame", "text", "svg", "part"]),
  n: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  fill: rgbaSchema.optional(),
  stroke: z.object({ c: rgbaSchema, w: z.number() }).optional(),
  r: z.number().optional(),
  op: z.number().optional(),
  clip: z.boolean().optional(),
  /** Auto layout, only where the page lays the children out as a flex row or column. */
  layout: z.object({
    d: z.enum(["H", "V"]),
    gap: z.number(),
    p: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    main: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]),
    cross: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]),
  }).optional(),
  text: z.object({
    s: z.string(),
    f: z.string(),
    wt: z.number(),
    sz: z.number(),
    lh: z.number().nullable(),
    ls: z.number(),
    c: rgbaSchema,
    al: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]),
  }).optional(),
  svg: z.string().optional(),
  part: z.string().optional(),
})

/** One measured box, as the plugin draws it (packages/figma-plugin/code.js, drawNode). */
export type DrawNode = z.infer<typeof drawNodeBase> & { ch?: DrawNode[] }

/**
 * The contract between the page's measuring script and the plugin's drawer.
 * code.js is plain JavaScript, so the tests hold both sides to this schema.
 */
export const drawNodeSchema: z.ZodType<DrawNode> = drawNodeBase.extend({ ch: z.lazy(() => z.array(drawNodeSchema)).optional() })

/** The largest number of boxes one page sends: a template screen holds a few hundred. */
export const DRAW_NODE_LIMIT = 4000

/**
 * Runs inside the rendered page, so it uses nothing from this module: the
 * function's own source is what the page receives.
 */
/** What the page posts: the tree, and whether the box limit cut it short. */
interface MeasuredPage {
  tree: DrawNode
  truncated: boolean
}

function measureDrawTree(name: string, limit: number): MeasuredPage {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const paint = canvas.getContext("2d", { willReadFrequently: true })
  let budget = limit
  // Any CSS colour, oklch included, read back as sRGB through one canvas pixel.
  const rgba = (value: string): Rgba | undefined => {
    if (!paint || !value || value === "transparent") return undefined
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = "#000"
    paint.fillStyle = value
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
    return a === 0 ? undefined : [r / 255, g / 255, b / 255, a / 255]
  }
  const px = (value: string) => Number.parseFloat(value) || 0
  const round = (value: number) => Math.round(value * 100) / 100
  const box = (rect: DOMRect, origin: DOMRect) => ({
    x: round(rect.left - origin.left),
    y: round(rect.top - origin.top),
    w: round(rect.width),
    h: round(rect.height),
  })
  const TEXT_ALIGN = new Map<string, NonNullable<DrawNode["text"]>["al"]>([["center", "CENTER"], ["right", "RIGHT"], ["end", "RIGHT"], ["justify", "JUSTIFIED"]])
  const FLEX_ALIGN = new Map<string, NonNullable<DrawNode["layout"]>["main"]>([["normal", "MIN"], ["flex-start", "MIN"], ["start", "MIN"], ["stretch", "MIN"], ["center", "CENTER"], ["flex-end", "MAX"], ["end", "MAX"], ["space-between", "SPACE_BETWEEN"]])
  const textStyle = (style: CSSStyleDeclaration, characters: string): DrawNode["text"] => ({
    s: style.textTransform === "uppercase" ? characters.toUpperCase() : characters,
    f: style.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    wt: Number(style.fontWeight) || 400,
    sz: px(style.fontSize),
    lh: style.lineHeight === "normal" ? null : px(style.lineHeight),
    ls: px(style.letterSpacing),
    c: rgba(style.color) ?? [0, 0, 0, 1],
    al: TEXT_ALIGN.get(style.textAlign) ?? "LEFT",
  })
  const BLOCK = /^(block|flex|grid|table|list-item|inline-flex|inline-grid|inline-block)/
  const visible = (element: Element) => {
    const style = getComputedStyle(element)
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0
  }
  // An element whose content is only text and plain inline runs is one text layer.
  const textOnly = (element: Element): boolean =>
    [...element.children].every((child) => {
      const style = getComputedStyle(child)
      return !BLOCK.test(style.display) && !rgba(style.backgroundColor) && px(style.borderTopWidth) === 0
        && child.tagName.toLowerCase() !== "svg" && !child.hasAttribute("data-part") && textOnly(child)
    })
  // Every box the plugin will create costs one from the budget, text runs included.
  const textNode = (style: CSSStyleDeclaration, range: Range, characters: string, origin: DOMRect): DrawNode | null => {
    if (budget <= 0) return null
    budget -= 1
    return { t: "text", n: characters.slice(0, 40), ...box(range.getBoundingClientRect(), origin), text: textStyle(style, characters) }
  }
  // An icon is a few shapes. A larger drawing would stall Figma, and a link
  // out of the drawing would load outside the page's policy, so neither goes.
  const SVG_ELEMENT_LIMIT = 200
  const drawableSvg = (copy: Element): boolean => {
    // An icon needs no picture or foreign markup, and either could load a file.
    copy.querySelectorAll("image, foreignObject, script").forEach((part) => part.remove())
    const parts = copy.querySelectorAll("*")
    if (parts.length > SVG_ELEMENT_LIMIT) return false
    for (const part of [copy, ...parts]) {
      for (const attribute of [...part.attributes]) {
        const value = attribute.value.trim()
        // Any prefix on href, declared or not; a backslash could hide an escaped url( in CSS.
        if (/(^|:)href$/i.test(attribute.name) && !value.startsWith("#")) part.removeAttribute(attribute.name)
        else if (/url\(\s*['"]?(?!#)|\\/i.test(value)) part.removeAttribute(attribute.name)
      }
    }
    budget -= parts.length
    return true
  }

  const walk = (element: Element, origin: DOMRect): DrawNode | null => {
    if (budget <= 0 || !visible(element)) return null
    const rect = element.getBoundingClientRect()
    if (rect.width < 0.5 && rect.height < 0.5) return null
    budget -= 1
    const style = getComputedStyle(element)
    const tag = element.tagName.toLowerCase()
    const base = { ...box(rect, origin), op: Number(style.opacity || 1) < 1 ? Number(style.opacity) : undefined }
    const part = element.getAttribute("data-part")
    if (part) {
      const characters = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 200)
      // A part the file lacks is drawn as a frame and its label, two layers.
      if (characters) budget -= 1
      return { t: "part", n: part, part, ...base, text: characters ? textStyle(style, characters) : undefined }
    }
    if (tag === "svg") {
      const copy = element.cloneNode(true)
      if (!(copy instanceof Element)) return null
      if (!drawableSvg(copy)) return { t: "frame", n: "Drawing too large to copy", ...base }
      copy.setAttribute("width", String(rect.width))
      copy.setAttribute("height", String(rect.height))
      const colour = rgba(style.color) ?? [0, 0, 0, 1]
      const hex = `#${colour.slice(0, 3).map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`
      return { t: "svg", n: element.getAttribute("aria-label") || "Icon", ...base, svg: copy.outerHTML.replace(/currentColor/g, hex) }
    }
    const border = px(style.borderTopWidth)
    const borderColour = rgba(style.borderTopColor)
    const children: DrawNode[] = []
    const node: DrawNode = {
      t: "frame",
      n: element.getAttribute("aria-label") || [tag, ...(element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 1)].join("."),
      ...base,
      fill: rgba(style.backgroundColor) ?? (tag === "img" ? [0.9, 0.9, 0.92, 1] : undefined),
      stroke: border > 0 && borderColour ? { c: borderColour, w: border } : undefined,
      r: px(style.borderTopLeftRadius) || undefined,
      clip: /^(hidden|clip|auto|scroll)/.test(style.overflow) || undefined,
      ch: children,
    }
    if (tag === "img") return node
    if (textOnly(element)) {
      const characters = element.textContent?.replace(/\s+/g, " ").trim()
      if (characters) {
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = textNode(style, range, characters, rect)
        if (text) children.push(text)
      }
      return node
    }
    let mixed = false
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const characters = child.textContent?.replace(/\s+/g, " ").trim()
        if (!characters) continue
        mixed = true
        const range = document.createRange()
        range.selectNodeContents(child)
        const text = textNode(style, range, characters, rect)
        if (text) children.push(text)
      } else if (child instanceof Element) {
        const drawn = walk(child, rect)
        if (drawn) children.push(drawn)
      }
    }
    // Auto layout only where Figma would place the children where the page did:
    // a single flex row or column of in-flow children with no margins.
    // A reversed direction or an evenly spread row has no auto layout match,
    // so those keep each child where the page put it.
    // An empty computed value is the CSS initial value: a DOM without layout leaves some blank.
    const direction = style.flexDirection || "row"
    const justify = style.justifyContent || "normal"
    const alignItems = style.alignItems || "normal"
    const flex = /flex$/.test(style.display) && (style.flexWrap || "nowrap") === "nowrap" && !mixed
      && !direction.endsWith("reverse") && FLEX_ALIGN.has(justify) && FLEX_ALIGN.has(alignItems)
      && [...element.children].filter(visible).every((child) => {
        const childStyle = getComputedStyle(child)
        return /^(static|relative)$/.test(childStyle.position || "static")
          && ["Top", "Right", "Bottom", "Left"].every((side) => px(childStyle.getPropertyValue(`margin-${side.toLowerCase()}`)) === 0)
      })
    if (flex) {
      const row = direction.startsWith("row")
      const align = (value: string) => FLEX_ALIGN.get(value) ?? "MIN"
      node.layout = {
        d: row ? "H" : "V",
        gap: px((row ? style.columnGap : style.rowGap) || style.gap),
        p: [
          px(style.paddingTop) + border,
          px(style.paddingRight) + px(style.borderRightWidth),
          px(style.paddingBottom) + px(style.borderBottomWidth),
          px(style.paddingLeft) + px(style.borderLeftWidth),
        ],
        main: align(justify),
        cross: align(alignItems),
      }
    }
    return node
  }

  const body = document.body
  const page = body.getBoundingClientRect()
  const tree = walk(body, page) ?? { t: "frame", n: name, x: 0, y: 0, w: page.width, h: page.height }
  tree.n = name
  tree.h = Math.max(tree.h, document.documentElement.scrollHeight)
  tree.fill ??= rgba(getComputedStyle(document.documentElement).backgroundColor) ?? [1, 1, 1, 1]
  return { tree, truncated: budget <= 0 }
}

/**
 * The page with its measuring script added. The script waits for the fonts,
 * because a text box measured in the fallback face is the wrong width, then
 * posts the tree to the panel that rendered it. A timer, not an animation
 * frame, starts the walk: a frame that is not painted never gets one. A model
 * page allows only its own script by hash, so the policy names this one too.
 */
export function drawablePage(html: string, name: string): string {
  const code = `(()=>{const measure=${measureDrawTree.toString()};`
    + `const send=()=>parent.postMessage({type:"bd-draw-tree",...measure(${JSON.stringify(name).replace(/</g, "\\u003c")},${DRAW_NODE_LIMIT})},"*");`
    + "addEventListener(\"load\",()=>document.fonts.ready.then(()=>setTimeout(send,100)));})()"
  const hash = `'sha256-${createHash("sha256").update(code).digest("base64")}'`
  const allowed = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*)"/i, (_, policy: string) =>
    /script-src/.test(policy) ? `${policy.replace(/script-src/, `script-src ${hash}`)}"` : `${policy}; script-src ${hash}"`)
  const script = `<script>${code}</script>`
  return /<\/body>/i.test(allowed) ? allowed.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${script}</body>`) : `${allowed}${script}`
}

/** What the plugin drew, as the relay carries it back. */
export const drawnSchema = z.object({
  page: z.string(),
  frames: z.number(),
  instances: z.number(),
  /** Client component names the page asked for and the file does not hold. */
  unmatched: z.array(z.string()),
  truncated: z.boolean().optional(),
})

/** What the plugin drew. */
export type Drawn = z.infer<typeof drawnSchema>

/** One sentence for the agent: where the page went and what it could not place. */
export function describeDrawn(drawn: Drawn): string {
  const parts = [`Drawn in Figma on the page "${drawn.page}": ${drawn.frames} frame(s), ${drawn.instances} client component instance(s).`]
  if (drawn.unmatched.length) {
    parts.push(`No component on the frame's page is named ${drawn.unmatched.map((name) => `"${name}"`).join(", ")}, so those stay plain layers, marked for the designer.`)
  }
  if (drawn.truncated) parts.push(`The page held more than ${DRAW_NODE_LIMIT} boxes, so the rest were not drawn.`)
  return parts.join(" ")
}
