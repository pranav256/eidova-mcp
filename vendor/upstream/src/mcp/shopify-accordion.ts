import { kitRuleFromClasses } from "./preview-html";
import { escapeClassName, translateClass, TW_DEFAULTS } from "./tw-translate";

/** A native disclosure adapter compiled only from recognizable source slots. */
export interface ShopifyAccordionAdapter {
  css: string;
}

const FAQ_RESET = `.ds-faq-item{display:block;margin:0;padding:0;border:0 solid currentColor;background:transparent;box-shadow:none;border-radius:0}
.ds-faq-item > summary{list-style:none;cursor:pointer;gap:1rem;min-height:2.75rem;margin:0;padding:0;color:inherit;font:inherit;text-align:left}
.ds-faq-item > summary::-webkit-details-marker{display:none}
.ds-faq-item > summary:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.ds-faq-content > .ds-faq-answer{padding:0;color:inherit}
.ds-faq-answer > :last-child{margin-bottom:0}
@media(prefers-reduced-motion:reduce){.ds-faq-item > summary,.ds-faq-item > summary > svg,.ds-faq-content{animation:none!important;transition:none!important}}`;

/** Read one JSX opening tag without treating quoted selectors as closing tags. */
function openingTag(source: string, tag: string): string | null {
  const start = source.search(new RegExp(`<${tag}\\b`));
  if (start < 0) return null;
  let quote = "";
  let depth = 0;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (char === ">" && depth === 0) return source.slice(start, index + 1);
  }
  return null;
}

/** Accept static class strings or the catalog's static cn(..., className) idiom. */
function slotClasses(source: string, tag: string): string | null {
  const opening = openingTag(source, tag);
  const value = opening?.match(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*cn\(([\s\S]*?),\s*className\s*\)\s*\})/);
  if (!value) return null;
  if (value[1] !== undefined || value[2] !== undefined) return value[1] ?? value[2] ?? null;
  const expression = value[3] ?? "";
  const strings = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  if (expression.replace(strings, "").replace(/[\s,+]/g, "")) return null;
  return [...expression.matchAll(strings)].map((part) => part[1] ?? part[2]).join(" ");
}

/** Remove Radix measurement-dependent animation while retaining native state styles. */
function nativeClasses(classes: string): string {
  return classes.split(/\s+/).filter((value) => !value.includes("animate-accordion-")).join(" ");
}

/** Unknown or runtime-dependent material keeps the existing generic fallback. */
function supportedClasses(classes: string | null | undefined): classes is string {
  if (classes == null) return false;
  return nativeClasses(classes).split(/\s+/).filter(Boolean).every((value) => {
    const rule = translateClass(value);
    return rule && !rule.media && !rule.body.includes("animation:")
      && rule.selector.startsWith(`.${escapeClassName(value)}`);
  });
}

/** Map Radix state to native open state and keep its transition duration. */
function nativeStateSelectors(css: string, selector: string): string {
  const suffix = selector.startsWith(".ds-faq-item") ? selector.slice(".ds-faq-item".length) : ` > ${selector}`;
  return css.replaceAll(`${selector}[data-state=open]`, `.ds-faq-item[open]${suffix}`)
    .replaceAll(`${selector}[data-state="open"]`, `.ds-faq-item[open]${suffix}`)
    .replaceAll(`${selector}[data-state=closed]`, `.ds-faq-item:not([open])${suffix}`)
    .replaceAll(`${selector}[data-state="closed"]`, `.ds-faq-item:not([open])${suffix}`)
    .replaceAll("transition-property:transform;", "transition-property:transform,rotate;")
    .replace(/(^|[;{]\s*)animation-duration:/g, "$1transition-duration:")
    .replace(/;--tw-animation-duration:[^;}]+/g, "");
}

/** Only read a source slot when its opening and closing markers are ordered. */
function slotContent(source: string, slot: "Trigger" | "Content"): string | null {
  const start = source.indexOf(`<AccordionPrimitive.${slot}`);
  const end = source.indexOf(`</AccordionPrimitive.${slot}>`);
  if (start < 0 || end <= start) return null;
  return source.slice(start, end);
}

/** Compile the supported Radix slot profile without substituting a Card recipe. */
export function buildShopifyAccordionAdapter(source: string): ShopifyAccordionAdapter | null {
  const content = slotContent(source, "Content");
  const trigger = slotContent(source, "Trigger");
  if (content === null || trigger === null) return null;
  const slots = [
    [".ds-faq-item", slotClasses(source, "AccordionPrimitive\\.Item")],
    [".ds-faq-item > summary", slotClasses(source, "AccordionPrimitive\\.Trigger")],
    [".ds-faq-content", slotClasses(content, "AccordionPrimitive\\.Content")],
    [".ds-faq-content > .ds-faq-answer", slotClasses(content, "div")],
    [".ds-faq-item > summary > .ds-icon", slotClasses(trigger, "Icon") ?? slotClasses(trigger, "svg")],
  ];
  if (slots.some(([, classes]) => !supportedClasses(classes))) return null;
  const rules = slots.map(([selector, classes]) => kitRuleFromClasses(selector!, nativeClasses(classes!)));
  const css = rules.map((rule, index) => nativeStateSelectors(rule.css, slots[index]![0]!));
  return { css: [rules.some((rule) => rule.usesTwVars) ? TW_DEFAULTS : "", FAQ_RESET, ...css].filter(Boolean).join("\n") };
}
