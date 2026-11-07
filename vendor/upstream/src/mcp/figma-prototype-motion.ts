import type { PrototypeEasing, PrototypeNode, PrototypeReaction, PrototypeReportEntry, PrototypeTransition } from "./figma-prototype"

/**
 * Figma's prototype links as the page runs them. Each layer with a link
 * carries a `data-go` list: what starts it (`on`), what it does (`do`), where
 * it goes (`to`, a Figma node id the page marks with `data-node`) and the
 * transition (`t`). The tool's runtime reads that list, so a click moves to
 * the next screen with the dissolve, push or slide the designer chose, and a
 * reader who asked for less motion gets the change at once. [BD-1299]
 */

/** One link as the page runs it. */
export interface PageLink {
  /** `hover` and `press` hold only while the pointer is over or down: a variant change undoes itself after. */
  on: "click" | "press" | "hover" | "enter" | "leave" | "timeout"
  /** Milliseconds before a timed link runs. */
  after?: number
  /** `change` shows another variant of the same instance, drawn hidden beside it. */
  do: "navigate" | "swap" | "overlay" | "scroll" | "back" | "close" | "url" | "change"
  to?: string
  url?: string
  t?: PageTransition
  /** Where an overlay sits on the screen that opened it. */
  at?: { x: number; y: number }
}

/** A transition as the runtime plays it. */
export interface PageTransition {
  k: "instant" | "dissolve" | "smart" | "move-in" | "move-out" | "push" | "slide-in" | "slide-out"
  dir?: "LEFT" | "RIGHT" | "TOP" | "BOTTOM"
  ms: number
  ease: string
}

const TRIGGERS = new Map<string, PageLink["on"]>([
  ["ON_CLICK", "click"],
  ["ON_PRESS", "click"],
  ["ON_DRAG", "click"],
  ["ON_HOVER", "hover"],
  ["MOUSE_ENTER", "enter"],
  ["MOUSE_LEAVE", "leave"],
  ["AFTER_TIMEOUT", "timeout"],
])

const NAVIGATIONS = new Map<string, PageLink["do"]>([
  ["NAVIGATE", "navigate"],
  ["SWAP", "swap"],
  ["OVERLAY", "overlay"],
  ["SCROLL_TO", "scroll"],
  ["CHANGE_TO", "change"],
])

const KINDS = new Map<string, PageTransition["k"]>([
  ["DISSOLVE", "dissolve"],
  ["SMART_ANIMATE", "smart"],
  ["SCROLL_ANIMATE", "smart"],
  ["MOVE_IN", "move-in"],
  ["MOVE_OUT", "move-out"],
  ["PUSH", "push"],
  ["SLIDE_IN", "slide-in"],
  ["SLIDE_OUT", "slide-out"],
])

/**
 * Figma's named easings as CSS. The springs have no CSS form, so each takes
 * the curve that settles the way it does: gentle and slow ease out long,
 * quick ends fast, and bouncy overshoots once.
 */
const EASINGS = new Map<string, string>([
  ["LINEAR", "linear"],
  ["EASE_IN", "cubic-bezier(0.42, 0, 1, 1)"],
  ["EASE_OUT", "cubic-bezier(0, 0, 0.58, 1)"],
  ["EASE_IN_AND_OUT", "cubic-bezier(0.42, 0, 0.58, 1)"],
  ["EASE_IN_BACK", "cubic-bezier(0.36, 0, 0.66, -0.56)"],
  ["EASE_OUT_BACK", "cubic-bezier(0.34, 1.56, 0.64, 1)"],
  ["EASE_IN_AND_OUT_BACK", "cubic-bezier(0.68, -0.6, 0.32, 1.6)"],
  ["GENTLE", "cubic-bezier(0.22, 1, 0.36, 1)"],
  ["SLOW", "cubic-bezier(0.22, 1, 0.36, 1)"],
  ["QUICK", "cubic-bezier(0.2, 0.8, 0.2, 1)"],
  ["BOUNCY", "cubic-bezier(0.34, 1.56, 0.64, 1)"],
  ["CUSTOM_SPRING", "cubic-bezier(0.22, 1, 0.36, 1)"],
])

/** The longest transition the page plays, so a typo in Figma never freezes a screen. */
const LONGEST_TRANSITION_MS = 5000

/** A Figma easing as a CSS timing function. */
export function easingCss(easing: PrototypeEasing): string {
  const curve = easing.easingFunctionCubicBezier
  if (easing.type === "CUSTOM_CUBIC_BEZIER" && curve) return `cubic-bezier(${curve.x1}, ${curve.y1}, ${curve.x2}, ${curve.y2})`
  return EASINGS.get(easing.type) ?? "cubic-bezier(0, 0, 0.58, 1)"
}

const DIRECTIONS = new Map<string, NonNullable<PageTransition["dir"]>>([
  ["LEFT", "LEFT"],
  ["RIGHT", "RIGHT"],
  ["TOP", "TOP"],
  ["BOTTOM", "BOTTOM"],
])

function pageTransition(transition: PrototypeTransition | null | undefined): PageTransition | undefined {
  if (!transition) return undefined
  const result: PageTransition = {
    k: KINDS.get(transition.type) ?? "dissolve",
    ms: Math.min(LONGEST_TRANSITION_MS, Math.max(0, Math.round(transition.duration * 1000))),
    ease: easingCss(transition.easing),
  }
  const dir = DIRECTIONS.get(transition.direction ?? "")
  if (dir) result.dir = dir
  return result
}

/** The links on one layer that the page can run; the rest go in the report through `linksReport`. */
export function pageLinks(reactions: PrototypeReaction[] | undefined): PageLink[] {
  const links: PageLink[] = []
  for (const reaction of reactions ?? []) {
    const on = TRIGGERS.get(reaction.trigger.type)
    if (!on) continue
    const after = on === "timeout" ? Math.round((reaction.trigger.timeout ?? 0) * 1000) : undefined
    for (const action of reaction.actions) {
      const link = pageLink(action)
      // Figma's "while pressing" holds a variant only while the pointer is down. [BD-1299]
      if (link?.do === "change" && reaction.trigger.type === "ON_PRESS") {
        links.push({ ...link, on: "press" })
        continue
      }
      if (link) links.push(after === undefined ? { on, ...link } : { on, after, ...link })
    }
  }
  return links
}

function pageLink(action: PrototypeReaction["actions"][number]): Omit<PageLink, "on"> | null {
  if (action.type === "BACK") return { do: "back" }
  if (action.type === "CLOSE") return { do: "close" }
  // Only a web address opens; a `javascript:` link from a file never runs.
  if (action.type === "URL") return action.url && /^https?:\/\//i.test(action.url) ? { do: "url", url: action.url } : null
  if (action.type !== "NODE" || !action.destinationId) return null
  const navigation = NAVIGATIONS.get(action.navigation ?? "NAVIGATE")
  if (!navigation) return null
  const link: Omit<PageLink, "on"> = { do: navigation, to: action.destinationId }
  const t = pageTransition(action.transition)
  if (t) link.t = t
  if (navigation === "overlay" && action.overlayRelativePosition) link.at = action.overlayRelativePosition
  return link
}

function walk(node: PrototypeNode, visit: (node: PrototypeNode) => void): void {
  visit(node)
  if (node.kind === "frame") for (const child of node.children) walk(child, visit)
  for (const variant of node.variants ?? []) walk(variant, visit)
}

/** The variant ids a node's instance can show: its own and the ones drawn beside it. */
function variantGroup(node: PrototypeNode): Set<string> | null {
  if (!node.variants?.length) return null
  return new Set([node.variantId, ...node.variants.map((variant) => variant.variantId)].filter((id): id is string => Boolean(id)))
}

/** Each node with the variant groups around it, innermost last; a variant sits in its instance's group. */
function walkGroups(node: PrototypeNode, groups: Set<string>[], visit: (node: PrototypeNode, groups: Set<string>[]) => void): void {
  const group = variantGroup(node)
  const inside = group ? [...groups, group] : groups
  visit(node, inside)
  if (node.kind === "frame") for (const child of node.children) walkGroups(child, inside, visit)
  for (const variant of node.variants ?? []) walkGroups(variant, inside, visit)
}

/**
 * The links the page cannot run, one line each: a destination the export did
 * not bring along, a trigger such as a key press, or an action such as a
 * variant change inside an interactive component.
 */
export function linksReport(frame: PrototypeNode): PrototypeReportEntry[] {
  const held = new Set<string>()
  walk(frame, (node) => { if (node.id) held.add(node.id) })
  const report: PrototypeReportEntry[] = []
  walkGroups(frame, [], (node, groups) => {
    for (const reaction of node.reactions ?? []) {
      if (!TRIGGERS.has(reaction.trigger.type)) {
        report.push({ name: node.name, reason: `its ${reaction.trigger.type.toLowerCase().replace(/_/g, " ")} prototype link does not run on the page` })
        continue
      }
      for (const action of reaction.actions) {
        if (action.navigation === "CHANGE_TO") {
          // A variant is a component, never a layer of the frame, so it is found among the variants drawn beside the instance.
          if (!action.destinationId || !groups.some((group) => group.has(action.destinationId!))) {
            report.push({ name: node.name, reason: "its change to prototype link leads to a variant the export did not bring along" })
          }
        } else if (action.type === "NODE" && action.destinationId && !held.has(action.destinationId)) {
          report.push({ name: node.name, reason: "its prototype link leads to a frame the export did not include" })
        } else if (!pageLink(action)) {
          report.push({ name: node.name, reason: `its ${(action.navigation ?? action.type).toLowerCase().replace(/_/g, " ")} prototype link does not run on the page` })
        }
      }
    }
  })
  return report
}

/** The `data-node`, `data-go` and `data-note` attributes for one layer, with a leading space. */
export function linkAttributes(node: PrototypeNode): string {
  return (node.id ? ` data-node="${attribute(node.id)}"` : "") + goAttributes(node)
}

/**
 * Only the `data-go` and `data-note` attributes. A block's wrapper carries
 * them, so a link survives when the model replaces the block's markup.
 */
export function goAttributes(node: PrototypeNode): string {
  const parts: string[] = []
  const links = pageLinks(node.reactions)
  if (links.length) parts.push(` data-go="${attribute(JSON.stringify(links))}"`)
  if (node.notes?.length) parts.push(` data-note="${attribute(node.notes.join(" | "))}"`)
  return parts.join("")
}

function attribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Marks a rendered layer as one member of its instance's variant group: the
 * group is the instance's Figma id, the member its variant id. The marks go
 * at the end of the first tag, so a block's wrapper carries them and a variant
 * change still works when the model replaced the block. [BD-1299]
 */
export function variantMarks(html: string, group: string, variantId: string | undefined, hidden: boolean): string {
  const end = html.indexOf(">")
  if (end < 0) return html
  const marks = ` data-vg="${attribute(group)}" data-variant="${attribute(variantId ?? "")}"${hidden ? " hidden" : ""}`
  return html.slice(0, end) + marks + html.slice(end)
}
