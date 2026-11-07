import { z } from "zod"

import { linkAttributes, linksReport, variantMarks } from "./figma-prototype-motion"
import { PROTOTYPE_RUNTIME } from "./figma-prototype-runtime"
import { PROTOTYPE_STATE_CSS, effectsCss, gradientCss, radiiCss, statesCss } from "./figma-prototype-style"

/**
 * Turns a Figma frame built from a Better Design library into one HTML page.
 *
 * The plugin serializes the selected frame into `PrototypeNode`s. Every
 * instance of a generated component carries the audit key its variant was
 * built from, so the page that rendered the library can hand back that
 * variant's real markup. Frames become flex containers, text stays text, and
 * anything drawn by hand travels as the SVG Figma exports for it. Nothing is
 * dropped without a line in the report. [BD-736]
 */

/** A colour as Figma reports it, channels 0 to 1. */
export interface PrototypeColor {
  r: number
  g: number
  b: number
  a: number
}

/** A paint: a bound variable wins over its literal colour, so the page follows the theme. */
export interface PrototypePaint {
  variable?: string
  color?: PrototypeColor
}

/** Auto layout as the frame declares it. */
export interface PrototypeLayout {
  direction: "HORIZONTAL" | "VERTICAL"
  gap: number
  padding: [number, number, number, number]
  primary: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN"
  counter: "MIN" | "CENTER" | "MAX" | "BASELINE"
  wrap?: boolean
}

/** How a node sizes on one axis inside its parent's auto layout. */
export type PrototypeSizing = "FIXED" | "HUG" | "FILL"

/** How a Figma transition eases, as the plugin copies it. */
export interface PrototypeEasing {
  type: string
  easingFunctionCubicBezier?: { x1: number; y1: number; x2: number; y2: number }
}

/** A prototype link's transition: `duration` is in seconds, as Figma states it. */
export interface PrototypeTransition {
  type: string
  direction?: string
  duration: number
  easing: PrototypeEasing
}

/** One thing a prototype link does, as Figma states it. [BD-1299] */
export interface PrototypeAction {
  type: string
  destinationId?: string | null
  navigation?: string
  transition?: PrototypeTransition | null
  overlayRelativePosition?: { x: number; y: number }
  url?: string
}

/** A prototype link on a layer: what starts it, and what it does. [BD-1299] */
export interface PrototypeReaction {
  trigger: { type: string; timeout?: number }
  actions: PrototypeAction[]
}

/** A shadow or blur on a frame. `radius` is Figma's blur radius, twice the CSS one. */
export interface PrototypeEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR"
  color?: PrototypeColor
  offset?: { x: number; y: number }
  radius: number
  spread?: number
}

/** A gradient fill; `transform` maps the frame's box onto the gradient's own space. */
export interface PrototypeGradient {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND"
  stops: Array<{ color: PrototypeColor; position: number }>
  transform: [[number, number, number], [number, number, number]]
  opacity: number
}

/** How a component looks in one state, read from the variant beside it. */
export interface PrototypeStateStyle {
  fill?: PrototypePaint
  stroke?: PrototypePaint
  effects?: PrototypeEffect[]
  opacity?: number
}

interface PrototypeBase {
  /** Figma's node id; a prototype link names its destination by it. */
  id?: string
  reactions?: PrototypeReaction[]
  /** Dev Mode annotations on the layer. */
  notes?: string[]
  name: string
  width: number
  height: number
  /** Offset inside the parent, used only when the parent has no auto layout. */
  x: number
  y: number
  sizing?: { horizontal: PrototypeSizing; vertical: PrototypeSizing }
  /** Figma's size limits on a layer in auto layout, which cap a filling or hugging layer. [BD-1380] */
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  absolute?: boolean
  opacity?: number
  /** The component variant this layer shows, when it is an instance from a component set. [BD-1299] */
  variantId?: string
  /**
   * The other variants of this instance that its "Change to" links reach,
   * each drawn whole with its own `variantId`. The page keeps them hidden
   * beside the instance and swaps one in when a link runs. [BD-1299]
   */
  variants?: PrototypeNode[]
}

/** An instance of a component the plugin generated, identified by its audit key. */
export interface PrototypeInstance extends PrototypeBase {
  kind: "instance"
  auditKey: string
  systemId: string
  /** Text layers in reading order, as this instance shows them. */
  texts: string[]
  /** The same layers as the main component holds them, so only edits are applied. */
  mainTexts: string[]
}

/** A plain frame, group or section: becomes a container. */
export interface PrototypeFrame extends PrototypeBase {
  kind: "frame"
  layout?: PrototypeLayout
  fill?: PrototypePaint
  stroke?: { paint: PrototypePaint; weight: number }
  radius?: number
  clips?: boolean
  /**
   * The client component this frame was drawn from, when it is an instance
   * from a file that is not a Better Design library. [BD-1056]
   */
  component?: string
  /** The client component's variant properties, such as `{ State: "Disabled" }`. */
  variant?: Record<string, string>
  /** The hover and pressed looks its component set defines. */
  states?: { hover?: PrototypeStateStyle; pressed?: PrototypeStateStyle }
  effects?: PrototypeEffect[]
  gradient?: PrototypeGradient
  /** Per-corner radii, top left then clockwise, when the corners differ. */
  radii?: [number, number, number, number]
  children: PrototypeNode[]
}

/** A text layer outside any instance. */
export interface PrototypeText extends PrototypeBase {
  kind: "text"
  characters: string
  fontSize: number
  fontWeight: number
  lineHeight?: number
  letterSpacing?: number
  fontFamily?: string
  align: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED"
  /** Figma's text case, when it is not the original. [BD-1380] */
  textCase?: "UPPER" | "LOWER" | "TITLE"
  /** Figma's text decoration, when there is one. [BD-1380] */
  decoration?: "UNDERLINE" | "STRIKETHROUGH"
  fill?: PrototypePaint
}

/** Anything else: carried as the SVG Figma exported for it. */
export interface PrototypeDrawing extends PrototypeBase {
  kind: "shape"
  svg: string
  /** Why it is a shape and not a component; goes in the report. */
  reason: string
}

/** Any layer of the serialized frame; `kind` says which. */
export type PrototypeNode = PrototypeInstance | PrototypeFrame | PrototypeText | PrototypeDrawing

/** The most variants one instance carries; the plugin stops at the same count. [BD-1299] */
export const MAX_VARIANTS = 8

const colorSchema = z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() })
const paintSchema = z.object({ variable: z.string().optional(), color: colorSchema.optional() })
const sizingSchema = z.enum(["FIXED", "HUG", "FILL"])
const easingSchema = z.object({
  type: z.string(),
  easingFunctionCubicBezier: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }).optional(),
})
const reactionSchema = z.object({
  trigger: z.object({ type: z.string(), timeout: z.number().optional() }),
  actions: z.array(z.object({
    type: z.string(),
    destinationId: z.string().nullable().optional(),
    navigation: z.string().optional(),
    transition: z.object({ type: z.string(), direction: z.string().optional(), duration: z.number(), easing: easingSchema }).nullable().optional(),
    overlayRelativePosition: z.object({ x: z.number(), y: z.number() }).optional(),
    url: z.string().optional(),
  })),
})
const effectSchema = z.object({
  type: z.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]),
  color: colorSchema.optional(),
  offset: z.object({ x: z.number(), y: z.number() }).optional(),
  radius: z.number(),
  spread: z.number().optional(),
})
const stateSchema = z.object({
  fill: paintSchema.optional(),
  stroke: paintSchema.optional(),
  effects: z.array(effectSchema).optional(),
  opacity: z.number().optional(),
})
const baseSchema = z.object({
  id: z.string().optional(),
  reactions: z.array(reactionSchema).optional(),
  notes: z.array(z.string()).optional(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  x: z.number(),
  y: z.number(),
  sizing: z.object({ horizontal: sizingSchema, vertical: sizingSchema }).optional(),
  minWidth: z.number().optional(),
  maxWidth: z.number().optional(),
  minHeight: z.number().optional(),
  maxHeight: z.number().optional(),
  absolute: z.boolean().optional(),
  opacity: z.number().optional(),
  variantId: z.string().optional(),
  variants: z.lazy(() => z.array(prototypeNodeSchema).max(MAX_VARIANTS)).optional(),
})

/** A frame as the plugin sends it; the panel's message is untrusted until it passes this. */
export const prototypeNodeSchema: z.ZodType<PrototypeNode> = z.lazy(() => z.discriminatedUnion("kind", [
  baseSchema.extend({
    kind: z.literal("instance"),
    auditKey: z.string(),
    systemId: z.string(),
    texts: z.array(z.string()),
    mainTexts: z.array(z.string()),
  }),
  baseSchema.extend({
    kind: z.literal("frame"),
    layout: z.object({
      direction: z.enum(["HORIZONTAL", "VERTICAL"]),
      gap: z.number(),
      padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      primary: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]),
      counter: z.enum(["MIN", "CENTER", "MAX", "BASELINE"]),
      wrap: z.boolean().optional(),
    }).optional(),
    fill: paintSchema.optional(),
    stroke: z.object({ paint: paintSchema, weight: z.number() }).optional(),
    radius: z.number().optional(),
    clips: z.boolean().optional(),
    component: z.string().optional(),
    variant: z.record(z.string(), z.string()).optional(),
    states: z.object({ hover: stateSchema.optional(), pressed: stateSchema.optional() }).optional(),
    effects: z.array(effectSchema).optional(),
    gradient: z.object({
      type: z.enum(["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"]),
      stops: z.array(z.object({ color: colorSchema, position: z.number() })),
      transform: z.tuple([z.tuple([z.number(), z.number(), z.number()]), z.tuple([z.number(), z.number(), z.number()])]),
      opacity: z.number(),
    }).optional(),
    radii: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    children: z.array(prototypeNodeSchema),
  }),
  baseSchema.extend({
    kind: z.literal("text"),
    characters: z.string(),
    fontSize: z.number(),
    fontWeight: z.number(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
    fontFamily: z.string().optional(),
    align: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]),
    textCase: z.enum(["UPPER", "LOWER", "TITLE"]).optional(),
    decoration: z.enum(["UNDERLINE", "STRIKETHROUGH"]).optional(),
    fill: paintSchema.optional(),
  }),
  baseSchema.extend({
    kind: z.literal("shape"),
    svg: z.string(),
    reason: z.string(),
  }),
]))

/**
 * The most layers and nesting a kept screen may hold. The Matrix Inbox frame,
 * the largest measured, has 3,873 layers 13 deep, so these leave room for a
 * denser screen and still refuse a tree built to exhaust the stack. [BD-1056]
 */
export const SCREEN_TREE_LIMITS = { depth: 64, nodes: 20_000 }

const SCREEN_TREE_LIMIT_MESSAGE = `A screen holds at most ${SCREEN_TREE_LIMITS.nodes} layers, nested at most ${SCREEN_TREE_LIMITS.depth} deep.`

/** One layer as the size walk reads it: only its children, each still unparsed. */
const shallowNodeSchema = z.looseObject({ children: z.array(z.unknown()).optional(), variants: z.array(z.unknown()).optional() })

/** A layer before its full shape is checked. */
type ShallowNode = z.infer<typeof shallowNodeSchema>

/**
 * Whether a tree stays within the screen limits. It walks with a stack, not
 * recursion, and parses one layer at a time, so a deep tree cannot overflow it.
 */
export function treeWithinLimits(root: ShallowNode): boolean {
  const stack: Array<{ node: ShallowNode; depth: number }> = [{ node: root, depth: 1 }]
  let nodes = 0
  while (stack.length) {
    const { node, depth } = stack.pop()!
    nodes += 1
    if (nodes > SCREEN_TREE_LIMITS.nodes || depth > SCREEN_TREE_LIMITS.depth) return false
    // A variant drawn beside an instance is layers too, so the limits count it. [BD-1299]
    for (const child of [...(node.children ?? []), ...(node.variants ?? [])]) {
      const parsed = shallowNodeSchema.safeParse(child)
      // A child that is not an object fails the full schema next, so it adds no depth here.
      if (parsed.success) stack.push({ node: parsed.data, depth: depth + 1 })
    }
  }
  return true
}

/**
 * A screen a project keeps [BD-1056]: the frame's name, the file it came
 * from, and its serialized layers. The name is how specs already find a
 * screen, so it is trimmed and kept short.
 */
export const projectScreenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  file: z.string().trim().min(1).max(200),
  // The shape is checked only after the size, so a deep tree never reaches
  // the recursive schema, where it would overflow the stack.
  tree: z
    .unknown()
    .refine((tree) => {
      const root = shallowNodeSchema.safeParse(tree)
      return root.success && treeWithinLimits(root.data)
    }, { message: SCREEN_TREE_LIMIT_MESSAGE })
    .pipe(prototypeNodeSchema),
})

/** What a screen save answers: the name it is kept under and how many screens the project now holds. */
export interface ProjectScreenSaved {
  name: string
  screens: number
}

/** The panel's request to the page that renders the library. */
export const prototypeRequestSchema = z.object({
  type: z.literal("better-design-figma-prototype"),
  id: z.string(),
  frame: prototypeNodeSchema,
})

/** A parsed request: the design system id and the frame to render. */
export type PrototypeRequest = z.infer<typeof prototypeRequestSchema>

/** What the rendering page knows about one library variant. */
export interface PrototypeMarkup {
  /** The variant's markup with this instance's text edits applied. */
  html: string
}

/** One layer the page could not carry over as a component. */
export interface PrototypeReportEntry {
  name: string
  reason: string
}

/** What the body renderer needs: the frame, the system it belongs to, and a way to fetch live markup. */
export interface RenderPrototypeBodyInput {
  frame: PrototypeNode
  systemId: string
  /** Live markup for an instance, or null when the page has no such variant. */
  lookup: (instance: PrototypeInstance) => PrototypeMarkup | null
  /** How a paint becomes CSS; `paintCss` unless a caller wants the frame's literal colours first. [BD-1299] */
  paint?: (paint: PrototypePaint | undefined) => string | null
  /** Wraps a rendered frame, such as to mark a client component as a block the model may replace. [BD-1299] */
  decorate?: (node: PrototypeFrame, parent: PrototypeFrame | null, html: string) => string
}

/** What wraps a rendered body into a page: the CSS it uses and the element that scopes the tokens. */
export interface PrototypeDocumentInput {
  title: string
  css: string
  /** The element that scopes the design system's tokens, copied attribute for attribute. */
  wrapper: { tag: string; attributes: Record<string, string> }
  body: string
}

/** Everything `renderPrototype` needs to write a whole document in one call. */
export interface RenderPrototypeInput extends RenderPrototypeBodyInput {
  css: string
  wrapper: PrototypeDocumentInput["wrapper"]
  title?: string
}

/** The finished document and the layers that could not map. */
export interface RenderPrototypeOutput {
  html: string
  report: PrototypeReportEntry[]
}

const ESCAPES = new Map([["&", "&amp;"], ["<", "&lt;"], [">", "&gt;"], ['"', "&quot;"]])

/** Escapes text for an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ESCAPES.get(char) ?? char)
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

function linear(channel: number): number {
  const value = Math.min(1, Math.max(0, channel))
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * An sRGB colour as `oklch()`, the form every colour in this codebase takes.
 * The matrices are the OKLab reference ones (Björn Ottosson, 2020).
 */
export function oklchCss(color: PrototypeColor): string {
  const [r, g, b] = [linear(color.r), linear(color.g), linear(color.b)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const aAxis = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.hypot(aAxis, bAxis)
  const hue = chroma < 0.0005 ? 0 : (Math.atan2(bAxis, aAxis) * 180 / Math.PI + 360) % 360
  const channels = `${round(lightness, 3)} ${round(chroma, 3)} ${round(hue, 1)}`
  return color.a >= 1 ? `oklch(${channels})` : `oklch(${channels} / ${round(color.a, 3)})`
}

/** A paint as CSS: the bound variable when there is one, else the literal colour. */
export function paintCss(paint: PrototypePaint | undefined): string | null {
  if (!paint) return null
  // A variable's name comes from the file, so only name characters reach the CSS; a `;` or `(` can never start a declaration. [BD-1299]
  if (paint.variable) return `var(--${paint.variable.split("/").join("-").replace(/[^\w-]/g, "")})`
  return paint.color ? oklchCss(paint.color) : null
}

const PRIMARY_ALIGN = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  SPACE_BETWEEN: "space-between",
} as const satisfies Record<PrototypeLayout["primary"], string>

const COUNTER_ALIGN = {
  MIN: "flex-start",
  CENTER: "center",
  MAX: "flex-end",
  BASELINE: "baseline",
} as const satisfies Record<PrototypeLayout["counter"], string>

function layoutCss(layout: PrototypeLayout | undefined): string[] {
  if (!layout) return []
  const rules = [
    "display:flex",
    `flex-direction:${layout.direction === "HORIZONTAL" ? "row" : "column"}`,
    `justify-content:${PRIMARY_ALIGN[layout.primary]}`,
    `align-items:${COUNTER_ALIGN[layout.counter]}`,
    `gap:${px(layout.gap)}`,
    `padding:${layout.padding.map(px).join(" ")}`,
  ]
  if (layout.wrap) rules.push("flex-wrap:wrap")
  return rules
}

/**
 * Size and placement inside the parent, as CSS declarations. A fixed axis keeps its pixels, a
 * filling axis stretches, and a hugging axis is left to the content. A child
 * of a frame without auto layout keeps the offset Figma gave it.
 */
export function placementCss(node: PrototypeNode, parent: PrototypeFrame | null): string[] {
  const rules: string[] = []
  const sizing = node.sizing ?? { horizontal: "FIXED", vertical: "FIXED" }
  if (!parent) {
    // The root keeps only the axes Figma fixed; a hugging axis follows its content.
    if (sizing.horizontal === "FIXED") rules.push(`width:${px(node.width)}`)
    if (sizing.vertical === "FIXED") rules.push(`height:${px(node.height)}`)
  } else if (!parent.layout || node.absolute) {
    rules.push("position:absolute", `left:${px(node.x)}`, `top:${px(node.y)}`)
    rules.push(`width:${px(node.width)}`, `height:${px(node.height)}`)
  } else {
    if (sizing.horizontal === "FIXED") rules.push(`width:${px(node.width)}`)
    if (sizing.vertical === "FIXED") rules.push(`height:${px(node.height)}`)
    const main = parent.layout.direction === "HORIZONTAL" ? sizing.horizontal : sizing.vertical
    const cross = parent.layout.direction === "HORIZONTAL" ? sizing.vertical : sizing.horizontal
    if (main === "FILL") rules.push("flex:1 1 0%", "min-width:0")
    else rules.push("flex:0 0 auto")
    if (cross === "FILL") rules.push("align-self:stretch")
  }
  // Figma's limits cap a layer that fills or hugs, such as a form that fills
  // its column up to 400px; without them the form stretches across the page.
  // Figma applies them only in auto layout, so a layer placed by position keeps
  // its exact size even when it carries an old limit. [BD-1380]
  if (!parent || (parent.layout && !node.absolute)) {
    const limits: Array<["minWidth" | "maxWidth" | "minHeight" | "maxHeight", string]> = [["minWidth", "min-width"], ["maxWidth", "max-width"], ["minHeight", "min-height"], ["maxHeight", "max-height"]]
    for (const [key, property] of limits) {
      const value = node[key]
      if (!value || value <= 0) continue
      const kept = rules.filter((rule) => !rule.startsWith(`${property}:`))
      rules.length = 0
      rules.push(...kept, `${property}:${px(value)}`)
    }
  }
  if (node.opacity !== undefined && node.opacity < 1) rules.push(`opacity:${node.opacity}`)
  return rules
}

function styleAttribute(rules: string[]): string {
  const kept = rules.filter(Boolean)
  return kept.length ? ` style="${escapeHtml(kept.join(";"))}"` : ""
}

function renderFrame(node: PrototypeFrame, parent: PrototypeFrame | null, context: Context): string {
  const placed = placementCss(node, parent)
  const rules = [...placed, ...layoutCss(node.layout), "box-sizing:border-box"]
  // Any frame may hold an absolute child, so it must be their containing
  // block; an absolute frame already is one.
  if (!placed.includes("position:absolute")) rules.push("position:relative")
  const fill = context.paint(node.fill)
  if (fill) rules.push(`background:${fill}`)
  const colours = { color: oklchCss, paint: context.paint }
  const gradient = node.gradient && gradientCss(node.gradient, node.width, node.height, colours)
  if (gradient) rules.push(`background-image:${gradient}`)
  const stroke = node.stroke && context.paint(node.stroke.paint)
  if (stroke) rules.push(`border:${px(node.stroke!.weight)} solid ${stroke}`)
  if (node.radius) rules.push(`border-radius:${px(node.radius)}`)
  const radii = radiiCss(node.radii)
  if (radii) rules.push(radii)
  rules.push(...effectsCss(node.effects, colours))
  if (node.clips) rules.push("overflow:hidden")
  const states = statesCss(node.states, colours)
  rules.push(...states.rules)
  const disabled = Object.values(node.variant ?? {}).some((value) => /^disabled$/i.test(value)) ? ' aria-disabled="true"' : ""
  const children = node.children.map((child) => renderNode(child, node, context)).join("")
  const html = `<div data-layer="${escapeHtml(node.name)}"${linkAttributes(node)}${states.attributes}${disabled}${styleAttribute(rules)}>${children}</div>`
  return context.decorate ? context.decorate(node, parent, html) : html
}

const TEXT_ALIGN = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
  JUSTIFIED: "justify",
} as const satisfies Record<PrototypeText["align"], string>

const TEXT_CASE = {
  UPPER: "uppercase",
  LOWER: "lowercase",
  TITLE: "capitalize",
} as const satisfies Record<NonNullable<PrototypeText["textCase"]>, string>

function renderText(node: PrototypeText, parent: PrototypeFrame | null, context: Context): string {
  const rules = [
    ...placementCss(node, parent),
    "margin:0",
    `font-size:${px(node.fontSize)}`,
    `font-weight:${node.fontWeight}`,
    `text-align:${TEXT_ALIGN[node.align]}`,
  ]
  if (node.lineHeight) rules.push(`line-height:${px(node.lineHeight)}`)
  if (node.letterSpacing) rules.push(`letter-spacing:${px(node.letterSpacing)}`)
  if (node.textCase) rules.push(`text-transform:${TEXT_CASE[node.textCase]}`)
  if (node.decoration) rules.push(`text-decoration:${node.decoration === "UNDERLINE" ? "underline" : "line-through"}`)
  // A generic family follows, so a font the reader lacks falls back to a sans face, not the browser's serif. [BD-1299]
  if (node.fontFamily) rules.push(`font-family:${JSON.stringify(node.fontFamily)},sans-serif`)
  const fill = context.paint(node.fill)
  if (fill) rules.push(`color:${fill}`)
  const lines = node.characters.split("\n").map(escapeHtml).join("<br>")
  return `<p data-layer="${escapeHtml(node.name)}"${linkAttributes(node)}${styleAttribute(rules)}>${lines}</p>`
}

function renderDrawing(node: PrototypeDrawing, parent: PrototypeFrame | null, context: Context): string {
  context.report.push({ name: node.name, reason: node.reason })
  const rules = [...placementCss(node, parent), "display:block"]
  return `<div data-layer="${escapeHtml(node.name)}"${linkAttributes(node)}${styleAttribute(rules)}>${node.svg}</div>`
}

function renderInstance(node: PrototypeInstance, parent: PrototypeFrame | null, context: Context): string {
  const markup = node.systemId === context.systemId ? context.lookup(node) : null
  if (!markup) {
    context.report.push({
      name: node.name,
      reason: node.systemId === context.systemId
        ? `no ${context.systemId} component matches ${node.auditKey}`
        : `built from ${node.systemId || "another library"}, not ${context.systemId}`,
    })
    return `<div data-layer="${escapeHtml(node.name)}" data-unmapped="${escapeHtml(node.auditKey)}"${styleAttribute(placementCss(node, parent))}></div>`
  }
  const rules = placementCss(node, parent).filter((rule) => !rule.startsWith("height:"))
  return `<div data-layer="${escapeHtml(node.name)}" data-component="${escapeHtml(node.auditKey)}"${linkAttributes(node)}${styleAttribute(rules)}>${markup.html}</div>`
}

interface Context {
  systemId: string
  lookup: RenderPrototypeInput["lookup"]
  report: PrototypeReportEntry[]
  paint: NonNullable<RenderPrototypeBodyInput["paint"]>
  decorate?: RenderPrototypeBodyInput["decorate"]
  /** How many variant groups had no Figma id to name them by. */
  groups?: number
}

function renderNode(node: PrototypeNode, parent: PrototypeFrame | null, context: Context): string {
  const html = renderLayer(node, parent, context)
  if (!node.variants?.length) return html
  // Each variant a "Change to" link reaches is drawn hidden beside the instance. [BD-1299]
  const group = node.id ?? `variants-${(context.groups = (context.groups ?? 0) + 1)}`
  return variantMarks(html, group, node.variantId, false)
    + node.variants.map((variant) => variantMarks(renderLayer(variant, parent, context), group, variant.variantId, true)).join("")
}

function renderLayer(node: PrototypeNode, parent: PrototypeFrame | null, context: Context): string {
  switch (node.kind) {
    case "frame": return renderFrame(node, parent, context)
    case "text": return renderText(node, parent, context)
    case "shape": return renderDrawing(node, parent, context)
    case "instance": return renderInstance(node, parent, context)
  }
}

function attributes(values: Record<string, string>): string {
  return Object.keys(values).sort()
    .map((name) => ` ${name}="${escapeHtml(values[name])}"`)
    .join("")
}

/** A rendered frame before it is wrapped in a document. */
export interface PrototypeBody {
  body: string
  report: PrototypeReportEntry[]
}

/** Renders the frame's markup and the report of what could not map, with no document around it. */
export function renderPrototypeBody(input: RenderPrototypeBodyInput): PrototypeBody {
  const context: Context = { systemId: input.systemId, lookup: input.lookup, report: [], paint: input.paint ?? paintCss, decorate: input.decorate }
  const body = renderNode(input.frame, null, context)
  return { body, report: [...context.report, ...linksReport(input.frame)] }
}

/** Wraps a rendered body in one self-contained HTML document. */
export function prototypeDocument(input: PrototypeDocumentInput): string {
  const tag = input.wrapper.tag || "div"
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${input.css}</style>`,
    `<style>html,body{margin:0}body{min-height:100vh}[data-layer]>[data-layer]{flex-shrink:0}[hidden]{display:none!important}${PROTOTYPE_STATE_CSS}</style>`,
    "</head>",
    "<body>",
    `<${tag}${attributes(input.wrapper.attributes)}>${input.body}</${tag}>`,
    // The same runtime a model page runs, so a frame's prototype links work here too. [BD-1299]
    `<script>${PROTOTYPE_RUNTIME}</script>`,
    "</body>",
    "</html>",
  ].join("\n")
}

/** Renders the frame as one self-contained HTML document. */
export function renderPrototype(input: RenderPrototypeInput): RenderPrototypeOutput {
  const { body, report } = renderPrototypeBody(input)
  const html = prototypeDocument({ title: input.title ?? input.frame.name, css: input.css, wrapper: input.wrapper, body })
  return { html, report }
}
