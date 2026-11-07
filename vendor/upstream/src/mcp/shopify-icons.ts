import type { DesignSystemIconPresentation } from "../design-systems/presentation";
import { SHOPIFY_ICON_GLYPHS, SHOPIFY_ICON_SOURCES } from "./shopify-icons.generated";

/** Preserve project-owned icon metadata; catalog defaults must not replace it. */
export function projectShopifyIcons(
  project: { iconLibraryId: string | null; iconVariant: string | null },
  library: { id: string; name: string; prefix: string; defaultVariant: string | null } | null,
): DesignSystemIconPresentation {
  if (!project.iconLibraryId || !library || library.id !== project.iconLibraryId) {
    throw new Error("Shopify icons unavailable: the project's selected icon library is missing");
  }
  return {
    id: project.iconLibraryId,
    name: library.name,
    prefix: library.prefix,
    variant: project.iconVariant ?? library.defaultVariant ?? "default",
    provenance: "explicit",
  };
}

function attribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

/** A source-derived accordion requires a disclosure glyph in the selected style. */
export function hasShopifyDisclosureIcon(icons: DesignSystemIconPresentation): boolean {
  const key = `${icons.prefix}:${icons.variant}`;
  if (!Object.hasOwn(SHOPIFY_ICON_GLYPHS, key)) return false;
  // SAFETY: the own-key check restricts this selection to the generated pack registry.
  return Object.hasOwn(SHOPIFY_ICON_GLYPHS[key as keyof typeof SHOPIFY_ICON_GLYPHS], "chevron-down");
}

/** Render the exact selected family and variant from the canonical local icon packs. */
export function buildShopifyIconSnippet(icons: DesignSystemIconPresentation): string {
  const key = `${icons.prefix}:${icons.variant}`;
  if (!Object.hasOwn(SHOPIFY_ICON_GLYPHS, key)) {
    throw new Error(`Shopify icons unavailable for ${icons.id} (${key}); no substitute icon family was used`);
  }
  // SAFETY: the own-key check above restricts key to the generated pack registry.
  const pack = SHOPIFY_ICON_GLYPHS[key as keyof typeof SHOPIFY_ICON_GLYPHS];
  // SAFETY: every generated pack has a source entry for its checked prefix.
  const source = SHOPIFY_ICON_SOURCES[icons.prefix as keyof typeof SHOPIFY_ICON_SOURCES];
  const licenseUrl = "url" in source.license ? source.license.url : "";
  const cases = Object.entries(pack).map(([role, glyph]) => {
    const svg = `<svg class="ds-icon" viewBox="0 0 ${glyph.width} ${glyph.height}" data-icon-library="${attribute(icons.id)}" data-icon-variant="${attribute(icons.variant)}" data-icon="${attribute(icons.prefix)}:${glyph.name}" aria-hidden="true" focusable="false">${glyph.body}</svg>`;
    return `  {%- when '${role}' -%}\n    ${svg}`;
  });
  return `{% comment %}
  Selected storefront icons: ${attribute(icons.name)} (${attribute(key)}).
  Source: canonical local Iconify pack @iconify-json/${attribute(icons.prefix)}.
  Author: ${attribute(source.author.name)}. ${attribute(source.author.url ?? "")}
  License: ${attribute(source.license.title)} (${attribute(source.license.spdx)}). ${attribute(licenseUrl)}
  Preserve this attribution, upstream license notices, SVG geometry, and opacity.
  Usage: {% render 'ds-icon', icon: 'delivery' %}
  Available: ${Object.keys(pack).join(" | ")}. Unknown roles render nothing.
{% endcomment %}
{%- case icon -%}
${cases.join("\n")}
{%- endcase -%}`;
}
