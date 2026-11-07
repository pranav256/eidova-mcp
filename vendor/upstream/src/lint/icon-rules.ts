import ts from "typescript";
import { svgGlyphOffset, type GlyphOffset } from "./svg-bounds";
import type { Finding, LintInput } from "./types";

// An icon that looks off-centre gets a one-pixel nudge at each place it is
// used, and the nudges drift apart while the icon stays wrong. This check
// counts the nudges per icon across the reviewed files and measures the icon
// file itself, so the finding can say which asset to fix and how. [BD-1305]

/** One rule id for both faults: the fix is the same file either way. */
export const ICON_NUDGE_RULE_ID = "icon/nudge-in-the-asset";

/** A glyph centre further from the box centre than this share of the box is off-centre. The app's own Nucleo set tops out at 6.9%. */
export const OFF_CENTRE_SHARE = 0.08;

/** The largest offset that counts as a nudge, in px. Tailwind's `1` step is 0.25rem, which is 4px. */
const NUDGE_MAX_PX = 4;

/** A small nudge the review found on an icon element. */
export interface IconNudgeSite {
  file: string;
  line: number;
  column: number;
  snippet: string;
  icon: string;
  /** The class or style property that carries the nudge. */
  via: string;
}

const VARIANT_PREFIX_RE = /^(?:[^:[\]]+:|\[[^\]]*\]:)*/;
// translate-x, translate-y, mt, mb, top and bottom with a step of px, 0.5 or 1,
// or an arbitrary length. Horizontal margins are not listed on purpose: a
// leading icon that needs less outer padding than the label keeps its margin.
// A value past the cap is no nudge, and the cap keeps the two length patterns
// from running long on a crafted value: at 64 characters their backtracking
// costs nothing.
const NUDGE_CLASS_RE = /^(-?)(translate-[xy]|m[tb]|top|bottom)-(?:(px|0\.5|1)|\[(-?(?:\d+\.?\d*|\.\d+))(px|rem)\])$/;
const LENGTH_RE = /(-?(?:\d+\.?\d*|\.\d+))(px|rem)/g;
const MAX_VALUE_LENGTH = 64;
const NUDGE_STYLE_PROPS = new Set(["marginTop", "marginBottom", "top", "bottom", "translate", "transform"]);
// A component named like an icon. `Icon` alone is an icon only with a `name` or
// `icon` prop; `IconButton` and the like are not icons.
const ICON_TAG_RE = /(?:Icon$|^(?:Lucide|Phosphor|Tabler|Solar|Hero)[A-Z])/;
const POSITIONED_CLASS_RE = /^(?:absolute|fixed|sticky)$/;
const OFFSET_CLASS_RE = /^-?(?:top|bottom)-/;

function lengthPx(value: number, unit: string): number {
  return unit === "rem" ? value * 16 : value;
}

/** True when the class moves an element by at most four px on one axis. */
export function isNudgeClass(className: string): boolean {
  if (className.length > MAX_VALUE_LENGTH) return false;
  const match = NUDGE_CLASS_RE.exec(className.replace(VARIANT_PREFIX_RE, ""));
  if (!match) return false;
  if (match[3]) return true;
  const px = Math.abs(lengthPx(Number(match[4]), match[5]));
  return px > 0 && px <= NUDGE_MAX_PX;
}

/** True when a numeric style value moves an element by at most four px. React renders the number as px. */
export function isNudgeStyleNumber(property: string, value: number): boolean {
  return NUDGE_STYLE_PROPS.has(property) && value !== 0 && Math.abs(value) <= NUDGE_MAX_PX;
}

/** True when a style string moves an element by at most four px, such as `translateY(1px)` or `0.125rem`. */
export function isNudgeStyleText(property: string, value: string): boolean {
  if (!NUDGE_STYLE_PROPS.has(property) || value.length > MAX_VALUE_LENGTH) return false;
  if (property === "transform" && !/translate/.test(value)) return false;
  const lengths = [...value.matchAll(LENGTH_RE)].map((m) => Math.abs(lengthPx(Number(m[1]), m[2])));
  return lengths.length > 0 && lengths.every((px) => px <= NUDGE_MAX_PX) && lengths.some((px) => px > 0);
}

function tagName(node: ts.JsxOpeningLikeElement): string | null {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : null;
}

function attribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | null {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name) return attr;
  }
  return null;
}

function literalText(initializer: ts.JsxAttributeValue | undefined): string | null {
  const value = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
  if (value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))) return value.text;
  return null;
}

/** The icon an element renders: a component named like an icon, or `<Icon name="…">` and `<Icon icon="…">`. */
function iconKey(node: ts.JsxOpeningLikeElement): string | null {
  const tag = tagName(node);
  if (!tag || !ICON_TAG_RE.test(tag)) return null;
  const name = literalText(attribute(node, "name")?.initializer) ?? literalText(attribute(node, "icon")?.initializer);
  if (tag === "Icon" && !name) return null;
  return name ? `${tag} ${name}` : tag;
}

/** True when the element is placed, so `top` and `bottom` set where it sits rather than nudging it. */
function isPositioned(classes: readonly string[], style: ts.ObjectLiteralExpression | null): boolean {
  if (classes.some((cls) => POSITIONED_CLASS_RE.test(cls.replace(VARIANT_PREFIX_RE, "")))) return true;
  for (const property of style?.properties ?? []) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || property.name.text !== "position") continue;
    if (ts.isStringLiteral(property.initializer)) return property.initializer.text !== "relative";
  }
  return false;
}

function nudgeVia(node: ts.JsxOpeningLikeElement): string | null {
  const className = literalText(attribute(node, "className")?.initializer) ?? literalText(attribute(node, "class")?.initializer);
  const classes = className?.split(/\s+/).filter(Boolean) ?? [];
  const style = attribute(node, "style")?.initializer;
  const object = style && ts.isJsxExpression(style) && style.expression && ts.isObjectLiteralExpression(style.expression)
    ? style.expression
    : null;
  const positioned = isPositioned(classes, object);
  const nudgeClass = classes.find((cls) => isNudgeClass(cls) && !(positioned && OFFSET_CLASS_RE.test(cls.replace(VARIANT_PREFIX_RE, ""))));
  if (nudgeClass) return nudgeClass;
  for (const property of object?.properties ?? []) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
    const name = property.name.text;
    if (positioned && (name === "top" || name === "bottom")) continue;
    const init = property.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
      if (isNudgeStyleText(name, init.text)) return `${name}: ${init.text}`;
      continue;
    }
    const number = ts.isNumericLiteral(init)
      ? Number(init.text)
      : ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)
        ? -Number(init.operand.text)
        : undefined;
    if (number !== undefined && isNudgeStyleNumber(name, number)) return `${name}: ${number}`;
  }
  return null;
}

/** Every icon element in a JSX file that carries a small nudge. */
export function iconNudgeSites(input: LintInput): IconNudgeSite[] {
  if (!/\.(tsx|jsx|js|ts)$/i.test(input.path)) return [];
  const sourceFile = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = input.content.split(/\r?\n/);
  const sites: IconNudgeSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const icon = iconKey(node);
      const via = icon ? nudgeVia(node) : null;
      if (icon && via) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        sites.push({ file: input.path, line: line + 1, column: character + 1, snippet: lines[line]?.trim() ?? "", icon, via });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

/** An icon file the review measured: the file and where its glyph sits. */
export interface IconAsset {
  file: string;
  line: number;
  snippet: string;
  offset: GlyphOffset;
}

const SVG_LIKE = /\.(svg|tsx|jsx)$/i;
// An icon file is small. A larger file is an illustration or a page, and the
// cap keeps the markup scans from running long on a crafted one.
const MAX_ASSET_CHARS = 20_000;

/**
 * Runs a walk over one file and treats a stack overflow as "nothing found":
 * lintFile already reported such a file as too complex to review. [BD-986]
 */
function guarded<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError && /maximum call stack/i.test(error.message)) return fallback;
    throw error;
  }
}

/**
 * True when a JSX file is an icon component: one `<svg>` with a viewBox and
 * nothing rendered outside it. A page that holds an inline svg beside other
 * markup is a consumer, not an asset.
 */
function isIconComponentSource(input: LintInput): boolean {
  if (/\.svg$/i.test(input.path)) return true;
  const sourceFile = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let svgs = 0;
  let outside = 0;
  const visit = (node: ts.Node, insideSvg: boolean): void => {
    // The element node, not its opening tag: the children sit beside the tag, under the element.
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const isSvg = tagName(opening) === "svg";
      if (isSvg) svgs++;
      else if (!insideSvg) outside++;
      insideSvg = insideSvg || isSvg;
    }
    ts.forEachChild(node, (child) => visit(child, insideSvg));
  };
  visit(sourceFile, false);
  // One svg, and every other JSX tag inside it: the file renders the icon and nothing else.
  return svgs === 1 && outside === 0;
}

/** Measures every icon asset among the inputs. */
export function iconAssets(inputs: readonly LintInput[]): IconAsset[] {
  const assets: IconAsset[] = [];
  for (const input of inputs) {
    if (!SVG_LIKE.test(input.path) || input.content.length > MAX_ASSET_CHARS) continue;
    if (!guarded(() => isIconComponentSource(input), false)) continue;
    const offset = svgGlyphOffset(input.content);
    if (!offset) continue;
    const lines = input.content.split(/\r?\n/);
    const line = input.content.slice(0, input.content.search(/<svg\b/i)).split(/\r?\n/).length;
    assets.push({ file: input.path, line, snippet: lines[line - 1]?.trim() ?? "", offset });
  }
  return assets;
}

function isOffCentre(offset: GlyphOffset): boolean {
  return Math.abs(offset.dx) > offset.viewBox.width * OFF_CENTRE_SHARE
    || Math.abs(offset.dy) > offset.viewBox.height * OFF_CENTRE_SHARE;
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** The viewBox attribute that centres the glyph without touching the path. */
function centredViewBox(offset: GlyphOffset): string {
  const { viewBox, dx, dy } = offset;
  return `viewBox="${round(viewBox.x + dx)} ${round(viewBox.y + dy)} ${round(viewBox.width)} ${round(viewBox.height)}"`;
}

function direction(offset: GlyphOffset): string {
  const parts: string[] = [];
  if (Math.abs(offset.dx) > 0.005) parts.push(`${round(Math.abs(offset.dx))} units ${offset.dx > 0 ? "right of" : "left of"}`);
  if (Math.abs(offset.dy) > 0.005) parts.push(`${round(Math.abs(offset.dy))} units ${offset.dy > 0 ? "below" : "above"}`);
  return parts.join(" and ");
}

const EXCEPTION = "A leading icon that needs less outer padding than the label keeps its horizontal margin: that is padding, not a nudge.";

/** Which file exports each name, read once per review so a lookup never rescans the inputs. */
function exportIndex(inputs: readonly LintInput[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const input of inputs) {
    for (const match of input.content.matchAll(/export\s+(?:default\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/g)) {
      if (!index.has(match[1])) index.set(match[1], input.path);
    }
  }
  return index;
}

/** The file that exports the icon the consumer renders, by its component name. */
function assetFor(icon: string, assets: readonly IconAsset[], exports: ReadonlyMap<string, string>): IconAsset | undefined {
  const name = icon.split(" ")[0];
  const byExport = exports.get(name);
  if (byExport) return assets.find((asset) => asset.file === byExport);
  const kebab = name.replace(/Icon$/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return assets.find((asset) => new RegExp(`(?:^|/)${kebab}\\.(?:svg|tsx|jsx)$`, "i").test(asset.file));
}

function placesList(sites: readonly IconNudgeSite[]): string {
  return sites.map((site) => `${site.file}:${site.line} (${site.via})`).join(", ");
}

function nudgedIconFinding(icon: string, sites: IconNudgeSite[], asset: IconAsset | undefined): Finding {
  const [first] = sites;
  const name = icon.split(" ")[0];
  const places = `${name} is nudged in ${sites.length} places: ${placesList(sites)}.`;
  let message: string;
  let fix: string;
  if (asset && isOffCentre(asset.offset)) {
    message = `${places} Its glyph sits ${direction(asset.offset)} the centre of its viewBox in ${asset.file}, so every consumer corrects the same asset.`;
    fix = `Fix the asset once: set ${centredViewBox(asset.offset)} in ${asset.file}, or move the path by (${round(-asset.offset.dx)}, ${round(-asset.offset.dy)}). Then remove the nudges. ${EXCEPTION}`;
  } else if (asset) {
    message = `${places} Its path bounds are centred in ${asset.file}, so the nudge is optical and belongs in the asset, not in each consumer.`;
    fix = `Move the path in ${asset.file} once, by the nudge amount, after checking the icon beside several labels. Then remove the nudges. ${EXCEPTION}`;
  } else {
    message = `${places} The icon's own file is not in this review, so the review cannot say whether its viewBox or its path is off.`;
    fix = `Fix the icon's source file once: re-centre its viewBox on the path bounds, or move the path by the nudge amount, then remove the nudges. Send the icon file with the review to get the exact value. ${EXCEPTION}`;
  }
  return {
    file: first.file,
    line: first.line,
    column: first.column,
    severity: "moderate",
    ruleId: ICON_NUDGE_RULE_ID,
    snippet: first.snippet,
    message,
    fix,
    kind: "measured-source",
    evidence: sites.map((site) => `${site.file}:${site.line} ${site.via}`),
  };
}

function offCentreAssetFinding(asset: IconAsset): Finding {
  const { viewBox } = asset.offset;
  return {
    file: asset.file,
    line: asset.line,
    severity: "moderate",
    ruleId: ICON_NUDGE_RULE_ID,
    snippet: asset.snippet,
    message: `The glyph in ${asset.file} sits ${direction(asset.offset)} the centre of its viewBox "${round(viewBox.x)} ${round(viewBox.y)} ${round(viewBox.width)} ${round(viewBox.height)}", so every place that uses it will nudge it back.`,
    fix: `Set ${centredViewBox(asset.offset)}, or move the path by (${round(-asset.offset.dx)}, ${round(-asset.offset.dy)}), then check the icon beside several labels.`,
    kind: "measured-source",
    evidence: [`path bounds ${round(asset.offset.bounds.minX)},${round(asset.offset.bounds.minY)} to ${round(asset.offset.bounds.maxX)},${round(asset.offset.bounds.maxY)}`],
  };
}

/**
 * Findings for icons nudged in more than one place and for icon files drawn
 * off-centre. Runs over the whole review, because the count crosses files.
 */
export function iconNudgeFindings(inputs: readonly LintInput[]): Finding[] {
  const assets = iconAssets(inputs);
  const byIcon = new Map<string, IconNudgeSite[]>();
  for (const input of inputs) {
    for (const site of guarded(() => iconNudgeSites(input), [])) {
      const sites = byIcon.get(site.icon) ?? [];
      sites.push(site);
      byIcon.set(site.icon, sites);
    }
  }
  const findings: Finding[] = [];
  const named = new Set<string>();
  const exports = exportIndex(inputs);
  for (const [icon, sites] of byIcon) {
    if (sites.length < 2) continue;
    const asset = assetFor(icon, assets, exports);
    findings.push(nudgedIconFinding(icon, sites, asset));
    if (asset) named.add(asset.file);
  }
  for (const asset of assets) {
    if (!named.has(asset.file) && isOffCentre(asset.offset)) findings.push(offCentreAssetFinding(asset));
  }
  return findings;
}
