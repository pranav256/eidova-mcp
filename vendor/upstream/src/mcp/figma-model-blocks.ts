import { expandDrawings, frameDrawings } from "./figma-model-drawings"
import { goAttributes, linksReport } from "./figma-prototype-motion"
import { modelPrototypeDocument, namedPartsReport, parseModelAnswer, partsReport, placementReport, stripOwnColours } from "./figma-model"
import { COMPONENT_RULES, DEFAULT_OUTLINE_BUDGET, type ModelDesignSystem, type ModelPrompt, outlineFrame, quote, systemReference } from "./figma-model-prompt"
import {
  type PrototypeFrame,
  type PrototypeNode,
  type PrototypePaint,
  type PrototypeReportEntry,
  escapeHtml,
  oklchCss,
  paintCss,
  placementCss,
  renderPrototypeBody,
} from "./figma-prototype"

/**
 * Model mode by blocks. Code draws the whole frame first, from the layers the
 * plugin sent, so layout, text, colours and icons match Figma whichever model
 * runs. Each outermost client component becomes a block, and the model only
 * writes working design-system markup for the blocks it can improve: a button
 * that clicks, a select that opens, a tab that switches. A block it leaves
 * alone stays as drawn. A cheap model then has far less to get wrong than a
 * whole page, which is where Haiku and local models lost the sidebar icons and
 * the layout on the Matrix Review frame. [BD-1299]
 */

/** One client component the model may replace, and where it sits. */
export interface DraftBlock {
  id: string
  node: PrototypeFrame
  /** The block's size and place in its parent, so new markup lands where the drawing was. */
  placement: string[]
}

/** The drawn frame and its blocks. */
export interface Draft {
  /** The frame as markup, each block's drawing between `<!--block:id-->` marks. */
  body: string
  blocks: DraftBlock[]
}

/**
 * A paint as the draft draws it: the frame's own colour first, because a kit
 * names its variables differently from the frame's paths, and a variable the
 * page does not define paints nothing.
 */
function draftPaint(paint: PrototypePaint | undefined): string | null {
  return paint?.color ? oklchCss(paint.color) : paintCss(paint)
}

/**
 * The most layers a block holds. A button, field or badge is a few layers; a
 * component past this, such as a whole sidebar or table, stays drawn and its
 * own components become the blocks, because a cheap model rewriting a whole
 * sidebar is what lost its icons. [BD-1299]
 */
export const BLOCK_LAYER_LIMIT = 30

function layerCount(node: PrototypeNode): number {
  return node.kind === "frame" ? 1 + node.children.reduce((sum, child) => sum + layerCount(child), 0) : 1
}

/**
 * Whether a layer inside this one carries a prototype link. Replacing such a
 * component would drop the link with its drawing, so it stays drawn and its
 * own parts become the blocks. [BD-1299]
 */
function linksInside(node: PrototypeNode): boolean {
  return node.kind === "frame" && node.children.some((child) => Boolean(child.reactions?.length) || linksInside(child))
}

/** Draws the frame, marking each outermost client component of at most `BLOCK_LAYER_LIMIT` layers as a block. */
export function draftBlocks(frame: PrototypeNode): Draft {
  const blocks: DraftBlock[] = []
  const blockIds = new Map<PrototypeFrame, string>()
  const walk = (node: PrototypeNode, parent: PrototypeFrame | null) => {
    if (node.kind !== "frame") return
    if (node.component && parent && layerCount(node) <= BLOCK_LAYER_LIMIT && !linksInside(node)) {
      const id = `b${blocks.length + 1}`
      blockIds.set(node, id)
      blocks.push({ id, node, placement: placementCss(node, parent) })
      return
    }
    for (const child of node.children) walk(child, node)
  }
  walk(frame, null)
  const { body } = renderPrototypeBody({
    frame,
    systemId: "",
    lookup: () => null,
    paint: draftPaint,
    decorate: (node, _parent, html) => {
      if (!node.component) return html
      const part = `data-part="${escapeHtml(node.component)}"${goAttributes(node)}`
      const id = blockIds.get(node)
      // `display:contents` keeps the wrapper out of the layout, so the drawing sits exactly as before.
      if (!id) return `<div ${part} style="display:contents">${html}</div>`
      return `<div data-block="${id}" ${part} style="display:contents"><!--block:${id}-->${html}<!--/block:${id}--></div>`
    },
  })
  return { body, blocks }
}

const BLOCK_SYSTEM_PROMPT = [
  "You turn the client components of one Figma frame into working design-system components.",
  "Code already drew the whole frame: its layout, text, colours and icons match Figma. Each client component is a block with an id.",
  "For each block that is a control or a component the system has (a button, field, select, menu, tab, badge, avatar, card, switch, checkbox), write markup that replaces it.",
  "Leave out a block that is only a picture or a label: the drawing stays. The tool keeps each block's size and position, so your markup fills the block's box.",
  "",
  "Rules:",
  ...COMPONENT_RULES,
  "",
  "Answer with exactly two fenced blocks and nothing else:",
  "```html",
  "<style>/* layout only, for classes you add */</style>",
  '<block id="b1"><!-- the markup that replaces block b1 --></block>',
  "```",
  "```json",
  "{\"unplaced\":[{\"name\":\"<layer name>\",\"reason\":\"<why it is not on the page>\"}]}",
  "```",
  "List every layer inside a block you replaced that your markup does not show, with the reason. Use an empty list when there is none.",
].join("\n")

/** What `buildBlockPrompt` needs. */
export interface BlockPromptInput {
  frame: PrototypeNode
  png?: string
  designSystem: ModelDesignSystem
}

/**
 * The block request: the system's parts, then each block as an outline of its
 * own layers. Text and drawings outside every block never reach the model,
 * because code already drew them. A block past the size budget is left out of
 * the prompt and stays as drawn.
 */
export function buildBlockPrompt(input: BlockPromptInput): ModelPrompt & { blocks: string[] } {
  const system = input.designSystem
  const { groups } = blockGroups(input.frame, system.clientParts)
  const sections: string[] = []
  const sent: string[] = []
  let used = 0
  for (const { lead, outline } of groups) {
    const heading = `### ${lead.id} | client component ${quote(lead.node.component ?? "")} | ${Math.round(lead.node.width)}x${Math.round(lead.node.height)}`
    const section = [heading, ...blockFacts(lead.node), "```", outline, "```"].join("\n")
    // A block past the budget stays as drawn: the page still shows it.
    if (used + section.length + 1 > DEFAULT_OUTLINE_BUDGET) break
    used += section.length + 1
    sections.push(section)
    sent.push(lead.id)
  }
  const text = [
    `Turn the client components of the Figma frame ${quote(input.frame.name)} into ${system.name} components (id \`${system.id}\`).`,
    input.png ? "The image is the frame as Figma renders it: each block is one component on it." : "No image came with this frame, so work from the outlines alone.",
    "",
    ...systemReference(system),
    "",
    "## Blocks",
    "Each block: its id, the client component, its size, then an outline of its layers, one line per layer.",
    "Colours are roles, never values: map ink to `--foreground`, muted to `--muted-foreground`, light to `--background` or `--card`, accent to `--primary`, and green, amber and red to the status badge classes.",
    "A drawing named by id (`svg s3`) goes in your markup as `<svg data-svg=\"s3\" width=\"16\" height=\"16\"></svg>`; the tool fills in the paths.",
    "",
    sections.join("\n\n") || "This frame has no client components, so there is nothing to replace.",
  ].join("\n")
  return { system: BLOCK_SYSTEM_PROMPT, text, image: input.png, omitted: [], blocks: sent }
}

/**
 * What a block's outline cannot say: the variant it shows, such as a disabled
 * state, and the designer's Dev Mode notes inside it. [BD-1299]
 */
function blockFacts(node: PrototypeFrame): string[] {
  const facts: string[] = []
  const variant = Object.entries(node.variant ?? {}).map(([name, value]) => `${name}=${value}`).join(", ")
  if (variant) facts.push(`Variant: ${variant}`)
  const notes: string[] = []
  const collect = (current: PrototypeNode) => {
    notes.push(...(current.notes ?? []))
    if (current.kind === "frame") current.children.forEach(collect)
  }
  collect(node)
  if (notes.length) facts.push(`Designer notes: ${notes.map(quote).join("; ")}`)
  return facts
}

/** Blocks with the same layers, sent once under the first one's id. */
interface BlockGroup {
  lead: DraftBlock
  copies: DraftBlock[]
  outline: string
}

/**
 * The draft and its blocks grouped by their outline. A frame repeats a
 * component with the same content often: Matrix's Move flow drew 248 blocks
 * from 100 distinct ones. The model writes each distinct block once and the
 * tool places that markup in every copy.
 */
function blockGroups(frame: PrototypeNode, clientParts: ModelDesignSystem["clientParts"]) {
  const draft = draftBlocks(frame)
  const ids = frameDrawings(frame)
  const byOutline = new Map<string, BlockGroup>()
  for (const block of draft.blocks) {
    const { outline } = outlineFrame(block.node, Number.POSITIVE_INFINITY, clientParts, ids)
    const group = byOutline.get(outline)
    if (group) group.copies.push(block)
    else byOutline.set(outline, { lead: block, copies: [], outline })
  }
  return { draft, groups: [...byOutline.values()] }
}

const BLOCK_REPLY = /<block\b[^>]*?\bid\s*=\s*["']?([\w-]+)["']?[^>]*>([\s\S]*?)<\/block\s*>/gi

/** The new markup for one block, keeping the place its drawing held. */
function replacement(block: DraftBlock, markup: string): string {
  // The markup keeps the exact box Figma draws: a component taller or wider than
  // its drawing overflows the box instead of pushing its neighbours, which is
  // what moved most of the page off its Figma place. The markup sits in its own
  // block inside the box, so an icon and a label stay on one line as the model
  // wrote them, and the markup starts at the top of the box. [BD-1380]
  const sized = /^(width|height|min-width|min-height|max-width|max-height|flex|flex-grow|flex-shrink|flex-basis|align-self):/
  const rules = [
    ...block.placement.filter((rule) => !sized.test(rule)),
    `width:${block.node.width}px`,
    `height:${block.node.height}px`,
    "flex:none",
    "overflow:visible",
    "box-sizing:border-box",
  ]
  if (!rules.some((rule) => rule.startsWith("position:"))) rules.push("position:relative")
  return `<div style="${escapeHtml(rules.join(";"))}"><div style="width:100%">${markup}</div></div>`
}

/**
 * The finished page for a block reply: the draft with each returned block
 * swapped in. Both the agent's answer file and a local model's reply end here.
 * A reply with no block is still a page, the frame as code drew it.
 */
export function pageFromBlocks(input: {
  frame: PrototypeNode
  designSystem: ModelDesignSystem
  text: string
  author: string
  warnings?: string[]
}) {
  const { frame, author } = input
  const { draft, groups } = blockGroups(frame, input.designSystem.clientParts)
  const answer = parseModelAnswer(input.text)
  const byId = new Map(groups.map((group) => [group.lead.id, group]))
  const warnings = [...(input.warnings ?? [])]
  const report: PrototypeReportEntry[] = []
  const themed = stripOwnColours({ body: answer.body, css: answer.css }, input.designSystem.tokensCss)
  let body = draft.body
  let replaced = 0
  for (const [, id, markup] of themed.body.matchAll(BLOCK_REPLY)) {
    const group = byId.get(id)
    if (!group) {
      report.push({ name: id, reason: `${author} returned a block the frame does not have, so the tool ignored it` })
      continue
    }
    for (const block of [group.lead, ...group.copies]) {
      const marks = new RegExp(`<!--block:${block.id}-->[\\s\\S]*?<!--/block:${block.id}-->`)
      // A function keeps a `$` in the model's markup from reading as a pattern.
      body = body.replace(marks, () => replacement(block, markup.trim()))
      replaced += 1
    }
    byId.delete(id)
  }
  if (themed.removed) {
    warnings.push(`${author} wrote ${themed.removed} colour value(s) of its own; the tool removed them so the page takes the system's colours`)
  }
  const drawn = expandDrawings(body, frameDrawings(frame), frame.name)
  report.unshift(...warnings.map((reason) => ({ name: frame.name, reason })))
  report.push(
    ...drawn.report,
    ...linksReport(frame),
    ...placementReport(frame, drawn.text, answer.unplaced),
    ...partsReport(drawn.text, themed.css),
    ...namedPartsReport(frame, drawn.text),
  )
  const html = modelPrototypeDocument({ title: frame.name, system: input.designSystem, css: themed.css, body: drawn.text })
  return { html, report, replaced }
}
