import type { PrototypeColor, PrototypeEffect, PrototypeFrame, PrototypeGradient, PrototypePaint, PrototypeStateStyle } from "./figma-prototype"

/**
 * What a frame shows beyond its fill and border: shadows, blurs, a gradient,
 * corners that differ, and the hover and pressed looks its component set
 * defines. Colours come in through the caller's own functions, so this file
 * stays free of the renderer it serves. [BD-1299]
 */

/** How the caller writes a literal colour and a paint as CSS. */
export interface StyleColours {
  color: (color: PrototypeColor) => string
  paint: (paint: PrototypePaint | undefined) => string | null
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`
}

/** Figma's blur radius is twice the CSS one. */
function blur(radius: number): string {
  return px(radius / 2)
}

/** A frame's shadows as one `box-shadow` value, or null when it has none. */
export function shadowCss(effects: PrototypeEffect[] | undefined, colours: StyleColours): string | null {
  const shadows = (effects ?? [])
    .filter((effect) => effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW")
    .map((effect) => {
      const offset = effect.offset ?? { x: 0, y: 0 }
      const color = colours.color(effect.color ?? { r: 0, g: 0, b: 0, a: 0.25 })
      const inset = effect.type === "INNER_SHADOW" ? "inset " : ""
      return `${inset}${px(offset.x)} ${px(offset.y)} ${blur(effect.radius)} ${px(effect.spread ?? 0)} ${color}`
    })
  // Figma lists the bottom effect first; CSS draws the first shadow on top.
  return shadows.length ? shadows.reverse().join(", ") : null
}

/** A frame's effects as CSS declarations: shadows, a layer blur and a background blur. */
export function effectsCss(effects: PrototypeEffect[] | undefined, colours: StyleColours): string[] {
  const rules: string[] = []
  const shadow = shadowCss(effects, colours)
  if (shadow) rules.push(`box-shadow:${shadow}`)
  const layer = effects?.find((effect) => effect.type === "LAYER_BLUR")
  if (layer) rules.push(`filter:blur(${blur(layer.radius)})`)
  const background = effects?.find((effect) => effect.type === "BACKGROUND_BLUR")
  if (background) rules.push(`backdrop-filter:blur(${blur(background.radius)})`, `-webkit-backdrop-filter:blur(${blur(background.radius)})`)
  return rules
}

type Point = { x: number; y: number }

/** Maps a point in the gradient's own space back onto the frame's box, both 0 to 1. */
function fromGradient(transform: PrototypeGradient["transform"], point: Point): Point | null {
  const [[a, b, c], [d, e, f]] = transform
  const det = a * e - b * d
  if (Math.abs(det) < 1e-9) return null
  const x = point.x - c
  const y = point.y - f
  return { x: (e * x - b * y) / det, y: (a * y - d * x) / det }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * A gradient fill as a CSS `background-image`. Figma draws a linear gradient
 * from (0, 0.5) to (1, 0.5) in its own space; mapping both ends back onto the
 * box gives the CSS angle and where each stop lands on the CSS gradient line.
 */
export function gradientCss(gradient: PrototypeGradient, width: number, height: number, colours: StyleColours): string | null {
  const stopColour = (color: PrototypeColor) => colours.color({ ...color, a: color.a * gradient.opacity })
  const at = (point: Point) => {
    const box = fromGradient(gradient.transform, point)
    return box ? { x: box.x * width, y: box.y * height } : null
  }
  const start = at({ x: 0, y: 0.5 })
  const end = at({ x: 1, y: 0.5 })
  if (!start || !end) return null
  if (gradient.type === "GRADIENT_LINEAR") {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    const radians = (angle * Math.PI) / 180
    const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)) || 1
    const along = (point: Point) => ((point.x - width / 2) * Math.sin(radians) - (point.y - height / 2) * Math.cos(radians)) / length + 0.5
    const [from, to] = [along(start), along(end)]
    const stops = gradient.stops.map((stop) => `${stopColour(stop.color)} ${round((from + stop.position * (to - from)) * 100)}%`)
    return `linear-gradient(${round((angle + 360) % 360)}deg, ${stops.join(", ")})`
  }
  const center = at({ x: 0.5, y: 0.5 })
  const edge = at({ x: 1, y: 0.5 })
  const side = at({ x: 0.5, y: 1 })
  if (!center || !edge || !side) return null
  const where = `${px(center.x)} ${px(center.y)}`
  if (gradient.type === "GRADIENT_ANGULAR") {
    const from = (Math.atan2(edge.x - center.x, -(edge.y - center.y)) * 180) / Math.PI
    const stops = gradient.stops.map((stop) => `${stopColour(stop.color)} ${round(stop.position * 100)}%`)
    return `conic-gradient(from ${round((from + 360) % 360)}deg at ${where}, ${stops.join(", ")})`
  }
  // A diamond has no CSS form; the ellipse with the same reach is the nearest.
  const rx = Math.hypot(edge.x - center.x, edge.y - center.y)
  const ry = Math.hypot(side.x - center.x, side.y - center.y)
  const stops = gradient.stops.map((stop) => `${stopColour(stop.color)} ${round(stop.position * 100)}%`)
  return `radial-gradient(${px(rx)} ${px(ry)} at ${where}, ${stops.join(", ")})`
}

/** Per-corner radii as one `border-radius` declaration. */
export function radiiCss(radii: PrototypeFrame["radii"]): string | null {
  return radii && radii.some((radius) => radius > 0) ? `border-radius:${radii.map(px).join(" ")}` : null
}

/** A frame's state looks: declarations for its style, and the `data-hover` and `data-press` attributes that name them. */
export interface StateDeclarations {
  rules: string[]
  attributes: string
}

/**
 * The hover and pressed looks as custom properties on the element, with the
 * names of the ones it sets. The page's fixed `PROTOTYPE_STATE_CSS` applies
 * them on `:hover` and `:active`, so the page needs no style block per frame.
 */
export function statesCss(states: PrototypeFrame["states"], colours: StyleColours): StateDeclarations {
  const rules: string[] = []
  let attributes = ""
  for (const [state, prefix] of [["hover", "hover"], ["pressed", "press"]] as const) {
    const look: PrototypeStateStyle | undefined = states?.[state]
    if (!look) continue
    const names: string[] = []
    const fill = colours.paint(look.fill)
    if (fill) { rules.push(`--${prefix}-bg:${fill}`); names.push("bg") }
    const line = colours.paint(look.stroke)
    if (line) { rules.push(`--${prefix}-line:${line}`); names.push("line") }
    const shadow = shadowCss(look.effects, colours)
    if (shadow) { rules.push(`--${prefix}-shadow:${shadow}`); names.push("shadow") }
    if (look.opacity !== undefined) { rules.push(`--${prefix}-fade:${look.opacity}`); names.push("fade") }
    if (names.length) attributes += ` data-${prefix}="${names.join(" ")}"`
  }
  return { rules, attributes }
}

/**
 * The page-wide rules that give the state properties and prototype links
 * their effect: a hover or pressed look, a pointer on a link, and the overlay
 * a link opens. Every prototype page carries it once.
 */
export const PROTOTYPE_STATE_CSS = [
  "[data-go]{cursor:pointer}",
  ...(["hover", "press"] as const).flatMap((prefix) => {
    const pseudo = prefix === "hover" ? ":hover" : ":active"
    return [
      `[data-${prefix}~=bg]${pseudo}{background:var(--${prefix}-bg)!important}`,
      `[data-${prefix}~=line]${pseudo}{border-color:var(--${prefix}-line)!important}`,
      `[data-${prefix}~=shadow]${pseudo}{box-shadow:var(--${prefix}-shadow)!important}`,
      `[data-${prefix}~=fade]${pseudo}{opacity:var(--${prefix}-fade)!important}`,
    ]
  }),
  ".bd-overlay{border:0;padding:0;margin:auto;background:none;max-width:none;max-height:none;overflow:visible}",
  ".bd-overlay::backdrop{background:oklch(0 0 0 / 0.4)}",
].join("")
