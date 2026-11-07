import { compactTokensCss, DS_KIT_CSS, HOVER_POLICY, MINIMUM_TEXT_CONTRAST } from "./html-kit";
import type { DesignSystemIconPresentation } from "../design-systems/presentation";
import { buildShopifyIconSnippet } from "./shopify-icons";
import { SHOPIFY_PAGE_SCOPE_CONTRACT } from "./redesign-contract";
import type { ShopifyAccordionAdapter } from "./shopify-accordion";

// Shopify theme compiler. It runs when a catalog DS is seeded or a generated
// project completes; its output is persisted as that system's maintained
// Shopify primitive set. MCP requests read the stored theme files verbatim.
// [BD-385]

export interface ThemeFile {
  path: string;
  content: string;
}

export interface DsShopifyKitInput {
  name: string;
  /** Token stylesheet: `:root{--background:...}` etc. from the registry. */
  tokensCss: string;
  /** Resolved selection, passed unchanged when the primitive set is compiled. */
  iconLibrary?: DesignSystemIconPresentation;
  /** Link to the full live showcase / project page. */
  viewUrl?: string;
  source?:
    | { kind: "catalog"; designSystemId: string }
    | { kind: "project"; projectId: string };
  /** Per-DS component material from buildDsComponentCss. */
  componentKit?: { css: string; covered: string[]; excluded: string[] };
  /** Persisted theme files. When present, formatting must not rebuild them. */
  themeFiles?: ThemeFile[];
}

// Commerce-only additions to the shared ds-* contract. Every color reads a DS
// token with an oklch fallback, mirroring DS_KIT_CSS.
export const DS_SHOPIFY_CSS = `html:root{font-size:100%;background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0))}
body{margin:0;background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0));font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);font-size:1rem;line-height:1.5;letter-spacing:normal;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
body.gradient,body.color-background-1,main#MainContent,.content-for-layout{background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0))}
body :where(button,input,select,textarea){font:inherit}
body :where(.gradient,.color-background-1,.color-background-2){background:var(--background,oklch(1 0 0));color:var(--foreground,oklch(0.2 0 0))}
body :where(.button,.shopify-payment-button__button){border-radius:var(--radius-md,var(--radius,0.5rem));background:var(--primary,oklch(0.25 0.01 260));color:var(--primary-foreground,oklch(0.98 0 0));box-shadow:var(--shadow-sm,none)}
body :where(.field__input,.select__select,.customer .field input,.customer select){border-radius:var(--radius-md,var(--radius,0.5rem));background:var(--input,var(--background,oklch(1 0 0)));color:var(--foreground,oklch(0.2 0 0))}
body :where(.card,.card__inner,.product__media,.cart-item__image-container){border-radius:var(--radius-lg,var(--radius,0.75rem))}
.ds.ds-embed{background:transparent;font-family:var(--font-sans,ui-sans-serif,system-ui,sans-serif);font-size:1rem;letter-spacing:normal}
.ds-container{width:min(calc(100% - 2.5rem),76rem);max-width:76rem;margin-inline:auto;padding:0}
.ds-section{padding-block:clamp(3rem,7vw,6rem)}
.ds-section-compact{padding-block:clamp(2rem,4vw,3.5rem)}
.ds-section-head{display:flex;align-items:end;justify-content:space-between;gap:1.5rem;margin-bottom:clamp(1.5rem,3vw,2.5rem)}
.ds-section-head .ds-section-title{font-size:clamp(1.65rem,3vw,2.5rem)}
.ds-section-copy{max-width:42rem;color:var(--muted-foreground,oklch(0.45 0.01 260))}
.ds-display,.ds-section-title,.ds-card-title{text-wrap:balance}
.ds-section-copy,.ds-supporting,.ds-card-desc{text-wrap:pretty}
.ds.ds-announce{background:var(--primary,oklch(0.25 0.01 260));color:var(--primary-foreground,oklch(0.98 0 0));text-align:center;padding:.55rem 1rem;font-size:.8125rem}
.ds-announce p{margin:0}
.ds-announce a{color:inherit;text-decoration:underline}
.ds-price{display:inline-flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
.ds-price-current{font-size:1.35rem;font-weight:700;letter-spacing:-.02em;color:var(--foreground,oklch(0.2 0 0))}
.ds-price-compare{color:var(--muted-foreground,oklch(0.45 0.01 260))}
.ds.ds-embed .ds-btn{min-height:2.75rem;white-space:nowrap;text-decoration:none}
.ds.ds-embed .ds-btn-primary{color:var(--primary-foreground,oklch(0.98 0 0))!important;-webkit-text-fill-color:currentColor}
.ds-card-media{display:block;overflow:hidden;background:var(--muted,oklch(0.95 0.01 90));aspect-ratio:4/5}
.ds-card-media img,.ds-card-media svg{display:block;width:100%;height:100%;object-fit:cover}
.ds-product-card{height:100%}
.ds-product-card .ds-card-body{padding:1.1rem 1.25rem .65rem}
.ds-product-card .ds-card-footer{padding:.75rem 1.25rem 1.25rem;border:0}
.ds-product-card .ds-card-title a{color:inherit;text-decoration:none}
.ds-product-card .ds-supporting{margin-bottom:.25rem}
.ds-faq{max-width:52rem}
.ds-faq-item.ds-card{display:block;padding:.25rem 1.25rem;margin:.75rem 0}
.ds-faq-item summary{cursor:pointer;padding:1.15rem 0;font-weight:600;color:var(--foreground,oklch(0.2 0 0))}
.ds-faq-answer{padding:0 0 1.25rem;color:var(--muted-foreground,oklch(0.45 0.01 260))}
.ds-grid{display:grid;grid-template-columns:repeat(var(--ds-cols,4),minmax(0,1fr));gap:clamp(1rem,2vw,1.75rem)}
.ds-grid-empty{grid-column:1/-1}
.ds-newsletter .ds-control-row{margin-top:1rem}
.ds-buy-form{margin:0;display:grid;gap:.75rem;justify-items:start}
.ds-buy-form .ds-btn{min-width:min(100%,16rem)}
.ds-featured{display:block}
.ds-qty{width:6rem}
.ds.ds-header-shell{position:relative;z-index:20;background:color-mix(in oklab,var(--background,oklch(1 0 0)) 90%,transparent);padding:1rem 0}
.ds-header-shell.is-sticky{position:sticky;top:0;backdrop-filter:blur(1rem)}
.ds-header.ds-card{min-height:4.75rem;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:2rem;padding:0 1.25rem;overflow:visible}
.ds-header-brand{font-weight:700;font-size:1.1rem;letter-spacing:-.02em;color:var(--foreground,oklch(0.2 0 0));text-decoration:none;white-space:nowrap}
.ds-header-logo{display:block;max-height:2.25rem;width:auto}
.ds-header-nav{display:flex;justify-content:center;gap:clamp(1rem,2.5vw,2rem);min-width:0}
.ds-header-link,.ds-header-nav a{color:var(--foreground,oklch(0.2 0 0));text-decoration:none;font-size:.9rem;font-weight:500}
.ds-header-link:focus-visible,.ds-header-nav a:focus-visible,.ds-footer a:focus-visible{outline:2px solid var(--ring,var(--primary,oklch(0.45 0.15 264)));outline-offset:.3rem;border-radius:var(--radius-sm,.25rem)}
.ds-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:1rem}
.ds-cart-link{display:inline-flex;align-items:center;gap:.35rem}
.ds-cart-count{display:inline-grid;place-items:center;min-width:1.35rem;height:1.35rem;padding:0 .3rem;border-radius:999px;background:var(--primary,oklch(0.25 0.01 260));color:var(--primary-foreground,oklch(0.98 0 0));font-size:.7rem;font-weight:700}
.ds-mobile-nav{display:none}
.ds-mobile-nav summary{list-style:none;cursor:pointer}
.ds-mobile-nav summary::-webkit-details-marker{display:none}
.ds-mobile-nav-panel{position:absolute;inset-inline:0;top:calc(100% + .5rem);padding:1.25rem;display:grid;gap:1rem;background:var(--card,var(--background,oklch(1 0 0)));border:1px solid var(--border,oklch(0.88 0.01 260));border-radius:var(--radius-xl,var(--radius,1rem));box-shadow:var(--shadow-lg,var(--shadow-md,none))}
.ds.ds-footer{background:var(--background,oklch(1 0 0));padding-block:1.25rem 2rem}
.ds-footer-panel.ds-card{display:block;padding:clamp(2rem,5vw,4rem)}
.ds-footer-grid{display:grid;grid-template-columns:minmax(14rem,1.4fr) repeat(2,minmax(10rem,1fr));gap:clamp(2rem,5vw,5rem)}
.ds-footer-brand{max-width:28rem}
.ds-footer-title{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 1rem}
.ds-footer nav{display:grid;gap:.7rem}
.ds-footer a{color:var(--muted-foreground,oklch(0.45 0.01 260));text-decoration:none;font-size:.9rem}
.ds-footer-bottom{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;margin-top:3rem;padding-top:1.5rem;border-top:1px solid var(--border,oklch(0.88 0.01 260))}
.ds-policy-list,.ds-payment-list{list-style:none;padding:0;margin:0;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.ds-payment-icon{display:block;width:2.25rem;height:auto}
.ds.ds-hero-section{background:var(--background,oklch(1 0 0));overflow:hidden;padding-block:1.25rem clamp(3rem,7vw,6rem)}
.ds-hero{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);align-items:center;gap:clamp(2.5rem,7vw,7rem);padding-block:clamp(2rem,5vw,4.5rem)}
.ds-hero.ds-hero-single{grid-template-columns:minmax(0,42rem);justify-content:start}
.ds-hero-content{display:grid;gap:1.25rem;align-content:center;max-width:38rem}
.ds-hero .ds-display{font-size:clamp(2.6rem,6vw,5.5rem);line-height:.98}
.ds-hero .ds-supporting{font-size:clamp(1rem,1.5vw,1.2rem);max-width:35rem}
.ds-hero-media{position:relative;order:2;min-width:0}
.ds-hero-media-has-image:before,.ds-hero-media-has-image:after{content:"";position:absolute;z-index:-1;border-radius:var(--radius-3xl,var(--radius-xl,var(--radius,1rem)));pointer-events:none}
.ds-hero-media-has-image:before{width:32%;height:28%;inset:-1rem auto auto -1rem;background:var(--pop-blue,transparent)}
.ds-hero-media-has-image:after{width:28%;height:24%;inset:auto -1rem -1rem auto;background:var(--pop-orange,transparent)}
.ds-hero-media img{display:block;width:100%;height:clamp(24rem,50vw,42rem);object-fit:cover;border-radius:var(--radius-3xl,var(--radius-xl,var(--radius,1rem)));background:var(--muted,oklch(0.95 0.01 90))}
.ds-hero-media>.ds-media-empty{min-height:clamp(24rem,50vw,42rem)}
.ds-hero-actions{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
.ds-hero-trust{font-size:.8rem;color:var(--muted-foreground,oklch(0.45 0.01 260));margin:0}
.ds-image-text{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(2rem,6vw,6rem);align-items:center}
.ds-image-text.ds-image-text-single{grid-template-columns:minmax(0,42rem)}
.ds-image-text-media.ds-card{display:block}
.ds-image-text-media img{display:block;width:100%;height:clamp(20rem,45vw,38rem);object-fit:cover;background:var(--muted,oklch(0.95 0.01 90))}
.ds-rich-text{max-width:52rem;text-align:center}
.ds-rich-text .ds-section-copy{margin-inline:auto}
.ds-rich-text .ds-btn{margin-top:1.25rem}
.ds-value-panel.ds-card{display:grid;grid-template-columns:repeat(var(--ds-cols,3),minmax(0,1fr));overflow:hidden}
.ds-value-item{padding:clamp(1.35rem,3vw,2rem)}
.ds-value-item+.ds-value-item{border-left:1px solid var(--border,oklch(0.88 0.01 260))}
.ds-value-title-row{display:flex;align-items:center;gap:.75rem}
.ds-icon{display:block;width:1.25rem;height:1.25rem;flex:none}
.ds-icon-tile{display:grid;place-items:center;flex:0 0 auto;width:2.5rem;height:2.5rem;border-radius:var(--radius-lg,var(--radius,1rem));background:var(--secondary,oklch(0.93 0.01 90));color:var(--secondary-foreground,var(--foreground,oklch(.31 .006 75)))}
.ds-icon-tile-blue{background:var(--pop-blue,var(--secondary,oklch(0.93 0.01 90)));color:var(--pop-blue-foreground,var(--foreground,oklch(.31 .006 75)))}
.ds-icon-tile-orange{background:var(--pop-orange,var(--secondary,oklch(0.93 0.01 90)));color:var(--pop-orange-foreground,var(--foreground,oklch(.31 .006 75)))}
.ds-icon-tile-green{background:var(--pop-green,var(--secondary,oklch(0.93 0.01 90)));color:var(--pop-green-foreground,var(--foreground,oklch(.31 .006 75)))}
.ds-product-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(20rem,.9fr);gap:clamp(2rem,6vw,6rem);padding-block:clamp(3rem,7vw,6rem)}
.ds-product-media-main.ds-card{display:block}
.ds-product-media-main img{display:block;width:100%;height:auto;min-height:30rem;max-height:46rem;object-fit:cover;background:var(--muted,oklch(0.95 0.01 90))}
.ds-product-media-main>.ds-media-empty{min-height:30rem}
.ds-product-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-top:.75rem}
.ds-product-thumbs img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--radius-md,var(--radius,.5rem))}
.ds-product-info{display:grid;gap:1.25rem;align-content:start}
.ds-product-info.ds-card{padding:clamp(1.5rem,4vw,3rem)}
.ds-product-info .ds-display{font-size:clamp(2rem,4vw,3.75rem)}
.ds-product-description{color:var(--muted-foreground,oklch(0.42 0.01 260))}
.ds-page-content.ds-card{display:block;padding:clamp(1.5rem,4vw,3rem)}
.ds-contact-form.ds-card{display:grid;gap:1rem;max-width:42rem;margin-top:2rem;padding:clamp(1.5rem,4vw,3rem)}
.ds-product-page,.ds-collection-page,.ds-page,.ds-cart-page,.ds-search-page{padding-block:clamp(3rem,7vw,6rem)}
.ds-collection-head,.ds-page-head{display:grid;gap:1rem;margin-bottom:clamp(2rem,5vw,4rem);max-width:52rem}
.ds-collection-head .ds-display,.ds-page-head .ds-display{font-size:clamp(2.4rem,5vw,4.75rem)}
.ds-cart-list{display:grid;gap:1rem;margin:2rem 0;padding:0;list-style:none}
.ds-cart-item.ds-card{display:grid;grid-template-columns:7rem minmax(0,1fr) auto;gap:1.25rem;align-items:center;padding:1rem}
.ds-cart-item img{display:block;width:7rem;aspect-ratio:1;object-fit:cover;border-radius:var(--radius-md,var(--radius,.5rem))}
.ds-cart-item .ds-media-empty{min-height:7rem;padding:.75rem}
.ds-cart-summary.ds-card{display:grid;justify-items:end;gap:1rem;margin-left:auto;max-width:28rem;padding:1.5rem;text-align:right}
.ds-search-form.ds-card{display:grid;grid-template-columns:minmax(0,32rem) auto;gap:.75rem;align-items:end;width:max-content;max-width:100%;margin:2rem 0 3rem;padding:1.25rem}
.ds-empty{display:grid;justify-items:start;gap:1rem;padding-block:2rem}
.ds-empty.ds-card{padding:1.5rem}
.ds-media-empty{display:grid;place-items:center;align-content:center;gap:.75rem;width:100%;min-height:18rem;padding:2rem;text-align:center;background:var(--secondary,var(--muted,oklch(0.94 0.01 90)));color:var(--muted-foreground,oklch(.55 .009 80))}
.ds-media-empty .ds-icon{width:1.5rem;height:1.5rem}
.ds-media-empty-title{margin:0;color:var(--foreground,oklch(.31 .006 75));font-weight:600}
.ds-media-empty-copy{max-width:22rem;margin:0;font-size:.875rem}
.ds-pagination{display:block;text-align:center;margin:2.5rem 0 0}
.ds-pagination .page,.ds-pagination .next,.ds-pagination .prev{display:inline-block;padding:.45rem .75rem}
.ds-pagination a{color:var(--foreground,oklch(0.2 0 0))}
.ds-pagination .current{font-weight:700;color:var(--primary,oklch(0.25 0.01 260))}
@media (max-width:989px){.ds-header.ds-card{grid-template-columns:auto 1fr auto;gap:1rem}.ds-mobile-nav{display:block}.ds-header-brand{justify-self:center}.ds-header-nav{display:none}.ds-header-actions .ds-header-link:not(.ds-cart-link){display:none}.ds-hero{grid-template-columns:1fr}.ds-hero-media{order:2}.ds-hero-media img{height:clamp(20rem,80vw,34rem)}.ds-value-panel.ds-card{grid-template-columns:1fr}.ds-value-item+.ds-value-item{border-left:0;border-top:1px solid var(--border,oklch(0.88 0.01 260))}.ds-footer-grid{grid-template-columns:1fr 1fr}.ds-footer-brand{grid-column:1/-1}.ds-product-layout{grid-template-columns:1fr}}
@media (max-width:749px){.ds-section-head{display:grid}.ds-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ds-header.ds-card{min-height:4rem}.ds-header-shell.is-sticky{position:relative}.ds-hero .ds-display{font-size:clamp(2.4rem,13vw,4rem)}.ds-image-text{grid-template-columns:1fr}.ds-footer-panel.ds-card{padding:2rem 1.25rem}.ds-footer-grid{grid-template-columns:1fr}.ds-footer-brand{grid-column:auto}.ds-footer-bottom{align-items:flex-start;flex-direction:column}.ds-cart-item.ds-card{grid-template-columns:5rem minmax(0,1fr)}.ds-cart-item img{width:5rem}.ds-cart-item .ds-media-empty{min-height:5rem}.ds-cart-item-total{grid-column:2}.ds-search-form.ds-card{grid-template-columns:1fr;width:100%}.ds-search-form .ds-btn{width:100%}}
@media (max-width:479px){.ds-grid{grid-template-columns:1fr}.ds-header-actions{gap:.6rem}.ds-cart-link>span:first-child{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}}
@media (pointer:coarse){.ds-mobile-nav summary,.ds-header-actions a{display:inline-flex;align-items:center;min-width:44px;min-height:44px}}
@media (hover:hover) and (pointer:fine){.ds-header-link:hover,.ds-header-nav a:hover,.ds-footer a:hover{text-decoration:underline;text-underline-offset:.25rem}.ds-card-media img{transition:transform .3s ease}.ds-card-media:hover img{transform:scale(1.025)}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.ds-card-media img{transition:none}}`;

const SNIPPET_BADGE = `{% comment %}
  Status label. Usage: {% render 'ds-badge', label: 'New' %}
  Optional tone: primary | outline | safe | warn | danger | unknown | verified
{% endcomment %}
{%- assign ds_badge_tone = tone | default: '' -%}
<span class="ds ds-embed ds-badge{% if ds_badge_tone != '' %} ds-badge-{{ ds_badge_tone }}{% endif %}">{{ label }}</span>`;

const SNIPPET_PRICE = `{% comment %}
  Price with compare-at strike-through and a Sale badge.
  Usage: {% render 'ds-price', product: product %}
  Or:    {% render 'ds-price', variant: product.selected_or_first_available_variant %}
{% endcomment %}
{%- liquid
  if variant
    assign ds_price = variant.price
    assign ds_compare_at = variant.compare_at_price
  else
    assign ds_price = product.price
    assign ds_compare_at = product.compare_at_price
  endif
-%}
<span class="ds ds-embed ds-price">
  <span class="ds-price-current">{{ ds_price | money }}</span>
  {%- if ds_compare_at > ds_price -%}
    <s class="ds-price-compare">{{ ds_compare_at | money }}</s>
    {% render 'ds-badge', label: 'Sale', tone: 'warn' %}
  {%- endif -%}
</span>`;

const SNIPPET_BUY_BUTTON = `{% comment %}
  Add-to-cart form that works without JavaScript.
  Usage: {% render 'ds-buy-button', product: product %}
  Multi-variant products automatically get a native variant dropdown; pass
  variant_id to pin one variant instead. Optional label overrides the button
  text; pass show_quantity: true for a quantity field.
{% endcomment %}
{%- assign ds_label = label | default: 'Add to cart' -%}
{%- if product.available -%}
{% form 'product', product, class: 'ds ds-embed ds-buy-form' %}
  {%- if variant_id -%}
    <input type="hidden" name="id" value="{{ variant_id }}">
  {%- elsif product.has_only_default_variant -%}
    <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
  {%- else -%}
    {% render 'ds-variant-select', product: product %}
  {%- endif -%}
  {%- if show_quantity -%}
    <label class="ds-label" for="ds-qty-{{ product.id }}">Quantity</label>
    <input id="ds-qty-{{ product.id }}" class="ds-input ds-qty" type="number" name="quantity" value="1" min="1">
  {%- endif -%}
  <button type="submit" class="ds-btn ds-btn-primary">{{ ds_label }}</button>
{% endform %}
{%- else -%}
<span class="ds ds-embed"><button type="button" class="ds-btn ds-btn-outline" disabled>Sold out</button></span>
{%- endif -%}`;

const SNIPPET_VARIANT_SELECT = `{% comment %}
  Native variant dropdown for a product form; no JavaScript. Renders inside a
  {% form 'product' %} and posts the chosen variant as name="id".
  Usage: {% render 'ds-variant-select', product: product %}
{% endcomment %}
<label class="ds-label" for="ds-variant-{{ product.id }}">Options</label>
<select id="ds-variant-{{ product.id }}" name="id" class="ds-select">
  {%- for variant in product.variants -%}
    <option value="{{ variant.id }}"{% if variant == product.selected_or_first_available_variant %} selected{% endif %}{% unless variant.available %} disabled{% endunless %}>
      {{ variant.title }} - {{ variant.price | money }}{% unless variant.available %} (sold out){% endunless %}
    </option>
  {%- endfor -%}
</select>`;

const SNIPPET_PAGINATION = `{% comment %}
  Styled wrapper for Shopify's default pagination. Render inside a
  {% paginate %} block: {% render 'ds-pagination', paginate: paginate %}
{% endcomment %}
{%- if paginate.pages > 1 -%}
<nav class="ds ds-embed ds-pagination" aria-label="Pagination">
  {{ paginate | default_pagination }}
</nav>
{%- endif -%}`;

const SNIPPET_PRODUCT_CARD = `{% comment %}
  Product tile for grids. Usage: {% render 'ds-product-card', product: product %}
  Optional: show_vendor: true, enable_quick_add: true
{% endcomment %}
<div class="ds ds-embed ds-card ds-product-card">
  <a href="{{ product.url }}" class="ds-card-media">
    {%- if product.featured_image -%}
      {%- assign ds_image_alt = product.featured_image.alt | default: product.title -%}
      {{ product.featured_image | image_url: width: 900 | image_tag: widths: '360, 540, 720, 900', sizes: '(min-width: 990px) 25vw, 50vw', alt: ds_image_alt }}
    {%- else -%}
      <span class="ds-media-empty" role="img" aria-label="Image unavailable">{% render 'ds-icon', icon: 'image' %}</span>
    {%- endif -%}
  </a>
  <div class="ds-card-body">
    <h3 class="ds-card-title"><a href="{{ product.url }}">{{ product.title }}</a></h3>
    {%- comment -%}Vendor sits under the title: a label above a heading is banned house style.{%- endcomment -%}
    {%- if show_vendor -%}<p class="ds-supporting">{{ product.vendor }}</p>{%- endif -%}
    {% render 'ds-price', product: product %}
  </div>
  {%- if enable_quick_add -%}
  <div class="ds-card-footer">
    {%- if product.has_only_default_variant -%}
      {% render 'ds-buy-button', product: product %}
    {%- else -%}
      <a href="{{ product.url }}" class="ds-btn ds-btn-outline">Choose options</a>
    {%- endif -%}
  </div>
  {%- endif -%}
</div>`;

const SNIPPET_ANNOUNCEMENT = `{% comment %}
  Announcement bar. Usage: {% render 'ds-announcement', text: 'Free shipping over $150' %}
  Optional: link: '/collections/all', link_label: 'Shop now'
{% endcomment %}
<div class="ds ds-embed ds-announce">
  <p>{{ text }}{%- if link and link_label %} <a href="{{ link }}">{{ link_label }}</a>{% endif -%}</p>
</div>`;

const SNIPPET_NEWSLETTER = `{% comment %}
  Email signup wired to Shopify customers.
  Usage: {% render 'ds-newsletter', id: section.id %}
  Optional: id, heading, button_label, success_text
  Pass id when the snippet can appear more than once on a page, so each
  email input keeps a unique id and its label stays correctly associated.
{% endcomment %}
{%- liquid
  assign ds_heading = heading | default: 'Subscribe to our emails'
  assign ds_button = button_label | default: 'Subscribe'
  assign ds_success = success_text | default: 'Thanks for subscribing.'
  if id
    assign ds_input_id = 'ds-newsletter-email-' | append: id
  else
    assign ds_input_id = 'ds-newsletter-email'
  endif
-%}
<div class="ds ds-embed ds-newsletter">
  <h2 class="ds-section-title">{{ ds_heading }}</h2>
  {% form 'customer', class: 'ds-field' %}
    <input type="hidden" name="contact[tags]" value="newsletter">
    {%- if form.posted_successfully? -%}
      <p role="status">{{ ds_success }}</p>
    {%- else -%}
      <div class="ds-control-row">
        <div>
          <label class="ds-label" for="{{ ds_input_id }}">Email</label>
        <input id="{{ ds_input_id }}" type="email" name="contact[email]" class="ds-input" autocomplete="email" required>
        </div>
        <button type="submit" class="ds-btn ds-btn-primary">{{ ds_button }}</button>
      </div>
      {%- if form.errors -%}<p class="ds-alert" role="alert">{{ form.errors | default_errors }}</p>{%- endif -%}
    {%- endif -%}
  {% endform %}
</div>`;

const FAQ_CARD_ITEM = `    <details class="ds-card ds-faq-item" {{ block.shopify_attributes }}>
      <summary>{{ block.settings.question }}</summary>
      <div class="ds-faq-answer">{{ block.settings.answer }}</div>
    </details>`;

/** Share the authored native FAQ structure between the section and item snippet. */
function faqItemMarkup(question: string, answer: string, attributes: string): string {
  return `<details class="ds-faq-item" {{ ${attributes} }}>
  <summary>{{ ${question} | escape }}{% render 'ds-icon', icon: 'chevron-down' %}</summary>
  <div class="ds-faq-content"><div class="ds-faq-answer">{{ ${answer} }}</div></div>
</details>`;
}

/** Export a page-scoped FAQ item only when its source material is supported. */
function faqItemSnippet(): ThemeFile {
  return { path: "snippets/ds-faq-item.liquid", content: `{% doc %}
  Native FAQ item using the selected system's accordion material and icons.
  @param {string} question - Plain-text question.
  @param {string} answer - Merchant-authored answer HTML.
  @param {string} [attributes] - Shopify theme-editor block attributes.
{% enddoc %}
${faqItemMarkup("question", "answer", "attributes")}` };
}

const SECTION_FAQ = `{% comment %}
  FAQ accordion using the browser's native details element. Merchants add it
  from the theme editor as "DS FAQ".
{% endcomment %}
<section class="ds ds-embed ds-section">
<div class="ds-container ds-faq">
  {%- if section.settings.heading != blank -%}<div class="ds-section-head"><h2 class="ds-section-title">{{ section.settings.heading }}</h2></div>{%- endif -%}
  {%- for block in section.blocks -%}
${FAQ_CARD_ITEM}
  {%- endfor -%}
</div>
</section>
{% schema %}
{
  "name": "DS FAQ",
  "settings": [
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Frequently asked questions" }
  ],
  "blocks": [
    {
      "type": "item",
      "name": "Question",
      "settings": [
        { "type": "text", "id": "question", "label": "Question" },
        { "type": "richtext", "id": "answer", "label": "Answer" }
      ]
    }
  ],
  "max_blocks": 20,
  "presets": [{ "name": "DS FAQ", "blocks": [{ "type": "item" }, { "type": "item" }] }]
}
{% endschema %}`;

const SECTION_FEATURED_COLLECTION = `{% comment %}
  Product grid from a merchant-chosen collection. Merchants add it from the
  theme editor as "DS Featured collection".
{% endcomment %}
{%- assign ds_collection = section.settings.collection | default: collections.all -%}
{%- if ds_collection.products_count > 0 or request.design_mode -%}
<section class="ds ds-embed ds-section">
<div class="ds-container ds-featured">
  <div class="ds-section-head">
    {%- if section.settings.heading != blank -%}<h2 class="ds-section-title">{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.show_view_all -%}<a class="ds-header-link" href="{{ ds_collection.url | default: routes.all_products_collection_url }}">View all products</a>{%- endif -%}
  </div>
  <div class="ds-grid" style="--ds-cols: {{ section.settings.columns_desktop }}">
    {%- for product in ds_collection.products limit: section.settings.products_to_show -%}
      {% render 'ds-product-card', product: product, show_vendor: section.settings.show_vendor, enable_quick_add: section.settings.enable_quick_add %}
    {%- else -%}
      <div class="ds-card ds-empty ds-grid-empty">
        <span class="ds-icon-tile ds-icon-tile-blue">{% render 'ds-icon', icon: 'image' %}</span>
        <h3 class="ds-card-title">Add products to this collection</h3>
        <p class="ds-card-desc">Real product images, titles, and prices will appear here.</p>
      </div>
    {%- endfor -%}
  </div>
</div>
</section>
{%- endif -%}
{% schema %}
{
  "name": "DS Featured collection",
  "settings": [
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Featured products" },
    { "type": "collection", "id": "collection", "label": "Collection" },
    { "type": "range", "id": "products_to_show", "min": 2, "max": 12, "step": 1, "default": 4, "label": "Products to show" },
    { "type": "range", "id": "columns_desktop", "min": 2, "max": 5, "step": 1, "default": 4, "label": "Columns on desktop" },
    { "type": "checkbox", "id": "show_vendor", "label": "Show vendor", "default": false },
    { "type": "checkbox", "id": "enable_quick_add", "label": "Enable quick add", "default": false },
    { "type": "checkbox", "id": "show_view_all", "label": "Show view all link", "default": true }
  ],
  "presets": [{ "name": "DS Featured collection" }]
}
{% endschema %}`;

const SECTION_HEADER = `{% comment %}
  Complete storefront header, including announcement, responsive navigation,
  search, account, and cart. The generated header group installs it globally.
{% endcomment %}
{%- if section.settings.announcement_text != blank -%}
  {% render 'ds-announcement', text: section.settings.announcement_text, link: section.settings.announcement_link, link_label: section.settings.announcement_link_label %}
{%- endif -%}
<div class="ds ds-embed ds-header-shell{% if section.settings.sticky %} is-sticky{% endif %}">
  <header class="ds-container ds-card ds-header">
    <details class="ds-mobile-nav">
      <summary class="ds-header-link" aria-label="Open navigation menu">Menu</summary>
      <nav class="ds-mobile-nav-panel" aria-label="Mobile">
        {%- for link in section.settings.menu.links -%}
          <a class="ds-header-link" href="{{ link.url }}"{% if link.current %} aria-current="page"{% endif %}>{{ link.title }}</a>
        {%- endfor -%}
        {%- if section.settings.show_search -%}<a class="ds-header-link" href="{{ routes.search_url }}">Search</a>{%- endif -%}
        {%- if shop.customer_accounts_enabled and section.settings.show_account -%}<a class="ds-header-link" href="{{ routes.account_url }}">Account</a>{%- endif -%}
      </nav>
    </details>
    <a class="ds-header-brand" href="{{ routes.root_url }}">
      {%- if section.settings.logo -%}
        {{ section.settings.logo | image_url: width: 360 | image_tag: widths: '180, 240, 360', alt: shop.name, class: 'ds-header-logo' }}
      {%- else -%}
        {{ shop.name }}
      {%- endif -%}
    </a>
    <nav class="ds-header-nav" aria-label="Main">
      {%- for link in section.settings.menu.links -%}
        <a href="{{ link.url }}"{% if link.current %} aria-current="page"{% endif %}>{{ link.title }}</a>
      {%- endfor -%}
    </nav>
    <div class="ds-header-actions">
      {%- if section.settings.show_search -%}<a class="ds-header-link" href="{{ routes.search_url }}">Search</a>{%- endif -%}
      {%- if shop.customer_accounts_enabled and section.settings.show_account -%}<a class="ds-header-link" href="{{ routes.account_url }}">Account</a>{%- endif -%}
      <a class="ds-header-link ds-cart-link" href="{{ routes.cart_url }}"><span>Cart</span><span class="ds-cart-count">{{ cart.item_count }}</span></a>
    </div>
  </header>
</div>
{% schema %}
{
  "name": "DS Header",
  "settings": [
    { "type": "image_picker", "id": "logo", "label": "Logo" },
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "text", "id": "announcement_text", "label": "Announcement", "default": "Free shipping and easy returns" },
    { "type": "text", "id": "announcement_link_label", "label": "Announcement link label" },
    { "type": "url", "id": "announcement_link", "label": "Announcement link" },
    { "type": "checkbox", "id": "show_search", "label": "Show search", "default": true },
    { "type": "checkbox", "id": "show_account", "label": "Show account", "default": true },
    { "type": "checkbox", "id": "sticky", "label": "Sticky header", "default": true }
  ],
  "presets": [{ "name": "DS Header" }]
}
{% endschema %}`;

const SECTION_FOOTER = `{% comment %}
  Complete storefront footer with navigation, newsletter, policies, and
  payment methods. The generated footer group installs it globally.
{% endcomment %}
<footer class="ds ds-embed ds-footer">
  <div class="ds-container ds-card ds-footer-panel">
    <div class="ds-footer-grid">
      <div class="ds-footer-brand">
        <a class="ds-header-brand" href="{{ routes.root_url }}">{{ shop.name }}</a>
        {%- if section.settings.text != blank -%}<div class="ds-section-copy">{{ section.settings.text }}</div>{%- endif -%}
        {%- if section.settings.show_newsletter -%}
          {% render 'ds-newsletter', id: section.id, heading: section.settings.newsletter_heading, button_label: section.settings.newsletter_button_label %}
        {%- endif -%}
      </div>
      <div>
        <h2 class="ds-footer-title">{{ section.settings.menu_heading }}</h2>
        <nav aria-label="{{ section.settings.menu_heading | escape }}">
          {%- for link in section.settings.menu.links -%}<a href="{{ link.url }}">{{ link.title }}</a>{%- endfor -%}
        </nav>
      </div>
      <div>
        <h2 class="ds-footer-title">{{ section.settings.secondary_menu_heading }}</h2>
        <nav aria-label="{{ section.settings.secondary_menu_heading | escape }}">
          {%- for link in section.settings.secondary_menu.links -%}<a href="{{ link.url }}">{{ link.title }}</a>{%- endfor -%}
        </nav>
      </div>
    </div>
    <div class="ds-footer-bottom">
      <div>
        <p class="ds-supporting">&copy; {{ 'now' | date: '%Y' }} {{ shop.name }}</p>
        {%- if section.settings.show_policies -%}
          <ul class="ds-policy-list" role="list">
            {%- for policy in shop.policies -%}{%- if policy != blank -%}<li><a href="{{ policy.url }}">{{ policy.title }}</a></li>{%- endif -%}{%- endfor -%}
          </ul>
        {%- endif -%}
      </div>
      {%- if section.settings.show_payment_icons -%}
        <ul class="ds-payment-list" role="list" aria-label="Accepted payment methods">
          {%- for type in shop.enabled_payment_types -%}<li>{{ type | payment_type_svg_tag: class: 'ds-payment-icon' }}</li>{%- endfor -%}
        </ul>
      {%- endif -%}
    </div>
  </div>
</footer>
{% schema %}
{
  "name": "DS Footer",
  "settings": [
    { "type": "richtext", "id": "text", "label": "Store description", "default": "<p>Thoughtful products, clear service, and a storefront designed around what matters.</p>" },
    { "type": "text", "id": "menu_heading", "label": "Menu heading", "default": "Shop" },
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "text", "id": "secondary_menu_heading", "label": "Secondary menu heading", "default": "Help" },
    { "type": "link_list", "id": "secondary_menu", "label": "Secondary menu", "default": "footer" },
    { "type": "checkbox", "id": "show_newsletter", "label": "Show newsletter", "default": true },
    { "type": "text", "id": "newsletter_heading", "label": "Newsletter heading", "default": "Get product news and useful updates" },
    { "type": "text", "id": "newsletter_button_label", "label": "Newsletter button label", "default": "Subscribe" },
    { "type": "checkbox", "id": "show_policies", "label": "Show policies", "default": true },
    { "type": "checkbox", "id": "show_payment_icons", "label": "Show payment icons", "default": true }
  ],
  "presets": [{ "name": "DS Footer" }]
}
{% endschema %}`;

const SECTION_HERO = `{% comment %}
  Product-led hero. A selected product supplies its image, price, and link;
  otherwise the section falls back to the first all-products item.
{% endcomment %}
{%- liquid
  assign ds_product = section.settings.product
  if ds_product == blank
    assign ds_product = collections.all.products.first
  endif
  assign ds_has_hero_image = false
  if section.settings.image or ds_product.featured_image
    assign ds_has_hero_image = true
  endif
  assign ds_show_hero_media = ds_has_hero_image
  if request.design_mode
    assign ds_show_hero_media = true
  endif
  assign ds_button_link = section.settings.button_link | default: ds_product.url | default: routes.all_products_collection_url
-%}
<section class="ds ds-embed ds-hero-section">
  <div class="ds-container ds-hero{% unless ds_show_hero_media %} ds-hero-single{% endunless %}">
    <div class="ds-hero-content">
      {%- if request.page_type == 'index' -%}<h1 class="ds-display">{{ section.settings.heading }}</h1>{%- else -%}<h2 class="ds-display">{{ section.settings.heading }}</h2>{%- endif -%}
      {%- if section.settings.text != blank -%}<p class="ds-supporting">{{ section.settings.text }}</p>{%- endif -%}
      {%- if ds_product != blank -%}{% render 'ds-price', product: ds_product %}{%- endif -%}
      <div class="ds-hero-actions">
        {%- if section.settings.button_label != blank -%}<a class="ds-btn ds-btn-primary" href="{{ ds_button_link }}">{{ section.settings.button_label }}</a>{%- endif -%}
        {%- if section.settings.secondary_label != blank -%}<a class="ds-btn ds-btn-outline" href="{{ section.settings.secondary_link }}">{{ section.settings.secondary_label }}</a>{%- endif -%}
      </div>
      {%- if section.settings.trust_text != blank -%}<p class="ds-hero-trust">{{ section.settings.trust_text }}</p>{%- endif -%}
    </div>
    {%- if ds_show_hero_media -%}<div class="ds-hero-media{% if ds_has_hero_image %} ds-hero-media-has-image{% endif %}">
      {%- if section.settings.image -%}
        {%- assign ds_image_alt = section.settings.heading | strip_html -%}
        {{ section.settings.image | image_url: width: 1600 | image_tag: widths: '600, 900, 1200, 1600', sizes: '(min-width: 990px) 55vw, 100vw', alt: ds_image_alt }}
      {%- elsif ds_product.featured_image -%}
        {%- assign ds_image_alt = ds_product.featured_image.alt | default: ds_product.title -%}
        {{ ds_product.featured_image | image_url: width: 1600 | image_tag: widths: '600, 900, 1200, 1600', sizes: '(min-width: 990px) 55vw, 100vw', alt: ds_image_alt }}
      {%- else -%}
        <div class="ds-card ds-media-empty">
          <span class="ds-icon-tile ds-icon-tile-blue">{% render 'ds-icon', icon: 'image' %}</span>
          <p class="ds-media-empty-title">Choose a hero image</p>
          <p class="ds-media-empty-copy">Select an image or featured product in this section.</p>
        </div>
      {%- endif -%}
    </div>{%- endif -%}
  </div>
</section>
{% schema %}
{
  "name": "DS Hero",
  "settings": [
    { "type": "product", "id": "product", "label": "Featured product" },
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Made for every day" },
    { "type": "text", "id": "text", "label": "Supporting line", "default": "Useful products, thoughtful details, and clear service." },
    { "type": "text", "id": "button_label", "label": "Button label", "default": "Shop the collection" },
    { "type": "url", "id": "button_link", "label": "Button link" },
    { "type": "text", "id": "secondary_label", "label": "Secondary button label" },
    { "type": "url", "id": "secondary_link", "label": "Secondary button link" },
    { "type": "text", "id": "trust_text", "label": "Trust line", "default": "Secure checkout. Easy returns. Human support." }
  ],
  "presets": [{ "name": "DS Hero" }]
}
{% endschema %}`;

const SECTION_RICH_TEXT = `{% comment %}
  Heading plus rich text, with an optional button.
{% endcomment %}
<section class="ds ds-embed ds-section">
<div class="ds-container ds-rich-text">
  {%- if section.settings.heading != blank -%}<h2 class="ds-section-title">{{ section.settings.heading }}</h2>{%- endif -%}
  <div class="ds-section-copy">{{ section.settings.text }}</div>
  {%- if section.settings.button_label != blank -%}
    <a class="ds-btn ds-btn-secondary" href="{{ section.settings.button_link }}">{{ section.settings.button_label }}</a>
  {%- endif -%}
</div>
</section>
{% schema %}
{
  "name": "DS Rich text",
  "settings": [
    { "type": "inline_richtext", "id": "heading", "label": "Heading" },
    { "type": "richtext", "id": "text", "label": "Text" },
    { "type": "text", "id": "button_label", "label": "Button label" },
    { "type": "url", "id": "button_link", "label": "Button link" }
  ],
  "presets": [{ "name": "DS Rich text" }]
}
{% endschema %}`;

const SECTION_IMAGE_WITH_TEXT = `{% comment %}
  Image beside heading, text, and an optional button.
{% endcomment %}
{%- assign ds_story_product = section.settings.product | default: collections.all.products[1] | default: collections.all.products.first -%}
<section class="ds ds-embed ds-section">
<div class="ds-container ds-image-text{% unless section.settings.image or ds_story_product.featured_image or request.design_mode %} ds-image-text-single{% endunless %}">
  {%- if section.settings.image or ds_story_product.featured_image or request.design_mode -%}<div class="ds-card ds-image-text-media">
  {%- if section.settings.image -%}
    {%- assign ds_image_alt = section.settings.heading | strip_html -%}
    {{ section.settings.image | image_url: width: 900 | image_tag: widths: '480, 720, 900', sizes: '(min-width: 750px) 50vw, 100vw', alt: ds_image_alt }}
  {%- elsif ds_story_product.featured_image -%}
    {%- assign ds_image_alt = ds_story_product.featured_image.alt | default: ds_story_product.title -%}
    {{ ds_story_product.featured_image | image_url: width: 1200 | image_tag: widths: '480, 720, 900, 1200', sizes: '(min-width: 750px) 50vw, 100vw', alt: ds_image_alt }}
  {%- else -%}
    <div class="ds-media-empty">
      <span class="ds-icon-tile ds-icon-tile-orange">{% render 'ds-icon', icon: 'image' %}</span>
      <p class="ds-media-empty-title">Choose a story image</p>
      <p class="ds-media-empty-copy">Select an image or product for this section.</p>
    </div>
  {%- endif -%}
  </div>{%- endif -%}
  <div class="ds-product-info">
    <h2 class="ds-section-title">{{ section.settings.heading }}</h2>
    <div class="ds-section-copy">{{ section.settings.text }}</div>
    {%- if section.settings.button_label != blank -%}
      <p><a class="ds-btn ds-btn-primary" href="{{ section.settings.button_link }}">{{ section.settings.button_label }}</a></p>
    {%- endif -%}
  </div>
</div>
</section>
{% schema %}
{
  "name": "DS Image with text",
  "settings": [
    { "type": "product", "id": "product", "label": "Product image fallback" },
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Pair text with an image" },
    { "type": "richtext", "id": "text", "label": "Text" },
    { "type": "text", "id": "button_label", "label": "Button label" },
    { "type": "url", "id": "button_link", "label": "Button link" }
  ],
  "presets": [{ "name": "DS Image with text" }]
}
{% endschema %}`;

const SECTION_MAIN_PRODUCT = `{% comment %}
  Product page main section. Assign the "product.ds" template to a product in
  the admin, or add this section to an existing product template.
{% endcomment %}
<div class="ds ds-embed ds-container ds-product-page">
  <div class="ds-product-layout">
    <div class="ds-product-media">
      <div class="ds-card ds-product-media-main">
      {%- if product.featured_image -%}
        {%- assign ds_image_alt = product.featured_image.alt | default: product.title -%}
        {{ product.featured_image | image_url: width: 1200 | image_tag: widths: '480, 720, 960, 1200', sizes: '(min-width: 750px) 50vw, 100vw', alt: ds_image_alt }}
      {%- else -%}
        <div class="ds-media-empty" role="img" aria-label="Product image unavailable">{% render 'ds-icon', icon: 'image' %}</div>
      {%- endif -%}
      </div>
      {%- if product.images.size > 1 -%}
        <div class="ds-product-thumbs">
          {%- for image in product.images offset: 1 limit: 4 -%}
            {%- assign ds_thumb_alt = image.alt | default: product.title -%}
            {{ image | image_url: width: 300 | image_tag: alt: ds_thumb_alt }}
          {%- endfor -%}
        </div>
      {%- endif -%}
    </div>
    <div class="ds-card ds-product-info">
      <h1 class="ds-display">{{ product.title }}</h1>
      {%- comment -%}Vendor sits under the title: a label above a heading is banned house style.{%- endcomment -%}
      {%- if section.settings.show_vendor -%}<p class="ds-supporting">{{ product.vendor }}</p>{%- endif -%}
      {% render 'ds-price', variant: product.selected_or_first_available_variant %}
      {% render 'ds-buy-button', product: product, show_quantity: section.settings.show_quantity %}
      <div class="ds-product-description">{{ product.description }}</div>
    </div>
  </div>
</div>
{% schema %}
{
  "name": "DS Product",
  "settings": [
    { "type": "checkbox", "id": "show_vendor", "label": "Show vendor", "default": true },
    { "type": "checkbox", "id": "show_quantity", "label": "Show quantity field", "default": true }
  ],
  "enabled_on": { "templates": ["product"] }
}
{% endschema %}`;

const SECTION_MAIN_COLLECTION = `{% comment %}
  Collection page main section with pagination. Assign the "collection.ds"
  template to a collection in the admin, or add to an existing template.
{% endcomment %}
{% paginate collection.products by section.settings.products_per_page %}
<div class="ds ds-embed ds-container ds-collection-page">
  <div class="ds-collection-head">
    <h1 class="ds-display">{{ collection.title }}</h1>
    {%- if collection.description != blank -%}<div class="ds-section-copy">{{ collection.description }}</div>{%- endif -%}
  </div>
  <div class="ds-grid" style="--ds-cols: {{ section.settings.columns_desktop }}">
    {%- for product in collection.products -%}
      {% render 'ds-product-card', product: product, show_vendor: section.settings.show_vendor, enable_quick_add: section.settings.enable_quick_add %}
    {%- else -%}
      <p class="ds-supporting">No products found.</p>
    {%- endfor -%}
  </div>
  {% render 'ds-pagination', paginate: paginate %}
</div>
{% endpaginate %}
{% schema %}
{
  "name": "DS Collection",
  "settings": [
    { "type": "range", "id": "products_per_page", "min": 4, "max": 24, "step": 4, "default": 12, "label": "Products per page" },
    { "type": "range", "id": "columns_desktop", "min": 2, "max": 5, "step": 1, "default": 4, "label": "Columns on desktop" },
    { "type": "checkbox", "id": "show_vendor", "label": "Show vendor", "default": false },
    { "type": "checkbox", "id": "enable_quick_add", "label": "Enable quick add", "default": false }
  ],
  "enabled_on": { "templates": ["collection"] }
}
{% endschema %}`;

const SECTION_CONTACT = `{% comment %}
  Contact form posting to Shopify's contact endpoint. No JavaScript.
{% endcomment %}
<section class="ds ds-embed ds-section">
<div class="ds-container ds-page">
  <h2 class="ds-section-title">{{ section.settings.heading }}</h2>
  {% form 'contact', class: 'ds-card ds-contact-form' %}
    {%- if form.posted_successfully? -%}
      <p role="status">Thanks for your message. We reply within one business day.</p>
    {%- else -%}
      {%- if form.errors -%}<p class="ds-alert" role="alert">{{ form.errors | default_errors }}</p>{%- endif -%}
      <div class="ds-field">
        <label class="ds-label" for="ds-contact-name-{{ section.id }}">Name</label>
        <input id="ds-contact-name-{{ section.id }}" class="ds-input" type="text" name="contact[name]" autocomplete="name">
      </div>
      <div class="ds-field">
        <label class="ds-label" for="ds-contact-email-{{ section.id }}">Email</label>
        <input id="ds-contact-email-{{ section.id }}" class="ds-input" type="email" name="contact[email]" autocomplete="email" required>
      </div>
      <div class="ds-field">
        <label class="ds-label" for="ds-contact-body-{{ section.id }}">Message</label>
        <textarea id="ds-contact-body-{{ section.id }}" class="ds-textarea" name="contact[body]" required></textarea>
      </div>
      <button type="submit" class="ds-btn ds-btn-primary">Send message</button>
    {%- endif -%}
  {% endform %}
</div>
</section>
{% schema %}
{
  "name": "DS Contact",
  "settings": [
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Contact us" }
  ],
  "presets": [{ "name": "DS Contact" }]
}
{% endschema %}`;

const SECTION_MULTICOLUMN = `{% comment %}
  Row of text cards, for value props or feature callouts.
{% endcomment %}
<section class="ds ds-embed ds-section-compact">
<div class="ds-container">
  {%- if section.settings.heading != blank -%}<div class="ds-section-head"><h2 class="ds-section-title">{{ section.settings.heading }}</h2></div>{%- endif -%}
  <div class="ds-card ds-value-panel" style="--ds-cols: {{ section.settings.columns_desktop }}">
    {%- for block in section.blocks -%}
      <div class="ds-value-item" {{ block.shopify_attributes }}>
          <div class="ds-value-title-row">
            {%- if block.settings.icon != 'none' -%}<span class="ds-icon-tile {% cycle 'ds-icon-tile-blue', 'ds-icon-tile-orange', 'ds-icon-tile-green' %}">{% render 'ds-icon', icon: block.settings.icon %}</span>{%- endif -%}
            <h3 class="ds-card-title">{{ block.settings.heading }}</h3>
          </div>
          <p class="ds-card-desc">{{ block.settings.text }}</p>
      </div>
    {%- endfor -%}
  </div>
</div>
</section>
{% schema %}
{
  "name": "DS Multicolumn",
  "settings": [
    { "type": "inline_richtext", "id": "heading", "label": "Heading" },
    { "type": "range", "id": "columns_desktop", "min": 2, "max": 4, "step": 1, "default": 3, "label": "Columns on desktop" }
  ],
  "blocks": [
    {
      "type": "column",
      "name": "Column",
      "settings": [
        { "type": "select", "id": "icon", "label": "Icon", "default": "quality", "options": [{ "value": "quality", "label": "Quality" }, { "value": "delivery", "label": "Delivery" }, { "value": "support", "label": "Support" }, { "value": "none", "label": "None" }] },
        { "type": "text", "id": "heading", "label": "Heading" },
        { "type": "text", "id": "text", "label": "Text" }
      ]
    }
  ],
  "max_blocks": 8,
  "presets": [{ "name": "DS Multicolumn", "blocks": [{ "type": "column" }, { "type": "column" }, { "type": "column" }] }]
}
{% endschema %}`;

const SECTION_MAIN_PAGE = `{% comment %}
  Default content page, styled by the selected design system.
{% endcomment %}
<main class="ds ds-embed ds-container ds-page">
  <header class="ds-page-head"><h1 class="ds-display">{{ page.title }}</h1></header>
  <div class="ds-card ds-page-content ds-product-description">{{ page.content }}</div>
</main>
{% schema %}
{
  "name": "DS Page",
  "enabled_on": { "templates": ["page"] }
}
{% endschema %}`;

const SECTION_MAIN_CART = `{% comment %}
  Native cart page. Quantity changes post through Shopify without JavaScript.
{% endcomment %}
<main class="ds ds-embed ds-container ds-cart-page">
  <header class="ds-page-head"><h1 class="ds-display">Your cart</h1></header>
  {%- if cart.item_count > 0 -%}
    <form action="{{ routes.cart_url }}" method="post">
      <ul class="ds-cart-list" role="list">
        {%- for item in cart.items -%}
          <li class="ds-card ds-cart-item">
            <a href="{{ item.url }}" aria-label="{{ item.product.title | escape }}">
              {%- if item.image -%}
                {%- assign ds_cart_alt = item.image.alt | default: item.product.title -%}
                {{ item.image | image_url: width: 280 | image_tag: widths: '140, 210, 280', alt: ds_cart_alt }}
              {%- else -%}
                <span class="ds-media-empty" role="img" aria-label="Image unavailable">{% render 'ds-icon', icon: 'image' %}</span>
              {%- endif -%}
            </a>
            <div>
              <h2 class="ds-card-title"><a href="{{ item.url }}">{{ item.product.title }}</a></h2>
              {%- unless item.product.has_only_default_variant -%}<p class="ds-supporting">{{ item.variant.title }}</p>{%- endunless -%}
              <label class="ds-label" for="ds-cart-quantity-{{ item.index | plus: 1 }}">Quantity</label>
              <input class="ds-input ds-qty" id="ds-cart-quantity-{{ item.index | plus: 1 }}" type="number" name="updates[]" value="{{ item.quantity }}" min="0">
              <a class="ds-header-link" href="{{ item.url_to_remove }}">Remove</a>
            </div>
            <strong class="ds-cart-item-total">{{ item.final_line_price | money }}</strong>
          </li>
        {%- endfor -%}
      </ul>
      <div class="ds-card ds-cart-summary">
        <p class="ds-supporting">Taxes and shipping calculated at checkout.</p>
        <div class="ds-price"><span>Subtotal</span><span class="ds-price-current">{{ cart.total_price | money }}</span></div>
        <div class="ds-hero-actions">
          <button class="ds-btn ds-btn-outline" type="submit" name="update">Update cart</button>
          <button class="ds-btn ds-btn-primary" type="submit" name="checkout">Checkout</button>
        </div>
      </div>
    </form>
  {%- else -%}
    <div class="ds-card ds-empty"><p class="ds-section-copy">Your cart is empty.</p><a class="ds-btn ds-btn-primary" href="{{ routes.all_products_collection_url }}">Continue shopping</a></div>
  {%- endif -%}
</main>
{% schema %}
{
  "name": "DS Cart",
  "enabled_on": { "templates": ["cart"] }
}
{% endschema %}`;

const SECTION_MAIN_SEARCH = `{% comment %}
  Search page with native Shopify query handling and paginated results.
{% endcomment %}
<main class="ds ds-embed ds-container ds-search-page">
  <header class="ds-page-head"><h1 class="ds-display">Search</h1></header>
  <form class="ds-card ds-search-form" action="{{ routes.search_url }}" method="get" role="search">
    <div>
      <label class="ds-label" for="ds-search-query-{{ section.id }}">What are you looking for?</label>
      <input class="ds-input" id="ds-search-query-{{ section.id }}" type="search" name="q" value="{{ search.terms | escape }}" autocomplete="off">
    </div>
    <button class="ds-btn ds-btn-primary" type="submit">Search</button>
  </form>
  {%- if search.performed -%}
    {% paginate search.results by section.settings.results_per_page %}
      <div class="ds-section-head"><h2 class="ds-section-title">{{ search.results_count }} results</h2></div>
      <div class="ds-grid" style="--ds-cols: {{ section.settings.columns_desktop }}">
        {%- for item in search.results -%}
          {%- if item.object_type == 'product' -%}
            {% render 'ds-product-card', product: item %}
          {%- else -%}
            <article class="ds-card"><div class="ds-card-body"><h3 class="ds-card-title"><a href="{{ item.url }}">{{ item.title }}</a></h3><p class="ds-card-desc">{{ item.content | strip_html | truncatewords: 24 }}</p></div></article>
          {%- endif -%}
        {%- else -%}
          <div class="ds-card ds-empty ds-grid-empty"><p class="ds-section-copy">No results found. Try a shorter or more general search.</p><a class="ds-btn ds-btn-outline" href="{{ routes.all_products_collection_url }}">Browse all products</a></div>
        {%- endfor -%}
      </div>
      {% render 'ds-pagination', paginate: paginate %}
    {% endpaginate %}
  {%- endif -%}
</main>
{% schema %}
{
  "name": "DS Search",
  "settings": [
    { "type": "range", "id": "results_per_page", "min": 4, "max": 24, "step": 4, "default": 12, "label": "Results per page" },
    { "type": "range", "id": "columns_desktop", "min": 2, "max": 4, "step": 1, "default": 4, "label": "Columns on desktop" }
  ],
  "enabled_on": { "templates": ["search"] }
}
{% endschema %}`;

const SECTION_MAIN_404 = `{% comment %}
  Compact not-found page with a clear recovery action.
{% endcomment %}
<main class="ds ds-embed ds-container ds-page">
  <div class="ds-card ds-empty">
    <h1 class="ds-display">Page not found</h1>
    <p class="ds-section-copy">The page may have moved or the link may be incorrect.</p>
    <a class="ds-btn ds-btn-primary" href="{{ routes.all_products_collection_url }}">Browse all products</a>
  </div>
</main>
{% schema %}
{
  "name": "DS 404",
  "enabled_on": { "templates": ["404"] }
}
{% endschema %}`;

const TEMPLATE_INDEX_JSON = `{
  "sections": {
    "hero": {
      "type": "ds-hero",
      "settings": {
        "heading": "Made for every day",
        "text": "Useful products, thoughtful details, and clear service.",
        "button_label": "Shop the collection",
        "button_link": "shopify://collections/all",
        "trust_text": "Secure checkout. Easy returns. Human support."
      }
    },
    "featured": {
      "type": "ds-featured-collection",
      "settings": { "heading": "Featured products", "collection": "all", "products_to_show": 4, "columns_desktop": 4, "show_view_all": true }
    },
    "story": {
      "type": "ds-image-with-text",
      "settings": {
        "heading": "Useful by design",
        "text": "<p>Every product should earn its place. Use this section to explain the materials, choices, or details that make yours worth choosing.</p>",
        "button_label": "Explore the collection",
        "button_link": "shopify://collections/all"
      }
    },
    "values": {
      "type": "ds-multicolumn",
      "blocks": {
        "quality": { "type": "column", "settings": { "icon": "quality", "heading": "Made to last", "text": "Explain the quality customers can see and feel." } },
        "delivery": { "type": "column", "settings": { "icon": "delivery", "heading": "Clear delivery", "text": "Set useful expectations for shipping and returns." } },
        "support": { "type": "column", "settings": { "icon": "support", "heading": "Human support", "text": "Tell customers where to get a real answer." } }
      },
      "block_order": ["quality", "delivery", "support"],
      "settings": { "heading": "What you can expect", "columns_desktop": 3 }
    },
    "faq": {
      "type": "ds-faq",
      "blocks": {
        "shipping": { "type": "item", "settings": { "question": "When will my order arrive?", "answer": "<p>Add your delivery timing and tracking details here.</p>" } },
        "returns": { "type": "item", "settings": { "question": "What is your return policy?", "answer": "<p>Summarize the return window and the first step for starting a return.</p>" } },
        "support": { "type": "item", "settings": { "question": "How can I contact you?", "answer": "<p>Add the fastest support channel and expected reply time.</p>" } }
      },
      "block_order": ["shipping", "returns", "support"],
      "settings": { "heading": "Questions, answered" }
    }
  },
  "order": ["hero", "featured", "story", "values", "faq"]
}`;

const TEMPLATE_PRODUCT_JSON = `{
  "sections": {
    "main": {
      "type": "ds-main-product",
      "settings": {}
    }
  },
  "order": ["main"]
}`;

const TEMPLATE_PAGE_JSON = `{
  "sections": { "main": { "type": "ds-main-page", "settings": {} } },
  "order": ["main"]
}`;

const TEMPLATE_CART_JSON = `{
  "sections": { "main": { "type": "ds-main-cart", "settings": {} } },
  "order": ["main"]
}`;

const TEMPLATE_SEARCH_JSON = `{
  "sections": { "main": { "type": "ds-main-search", "settings": {} } },
  "order": ["main"]
}`;

const TEMPLATE_404_JSON = `{
  "sections": { "main": { "type": "ds-main-404", "settings": {} } },
  "order": ["main"]
}`;

const HEADER_GROUP_JSON = `{
  "name": "Header group",
  "type": "header",
  "sections": {
    "ds_header": {
      "type": "ds-header",
      "settings": { "menu": "main-menu", "announcement_text": "Free shipping and easy returns", "show_search": true, "show_account": true, "sticky": true }
    }
  },
  "order": ["ds_header"]
}`;

const FOOTER_GROUP_JSON = `{
  "name": "Footer group",
  "type": "footer",
  "sections": {
    "ds_footer": {
      "type": "ds-footer",
      "settings": { "menu": "main-menu", "secondary_menu": "footer", "show_newsletter": true, "show_policies": true, "show_payment_icons": true }
    }
  },
  "order": ["ds_footer"]
}`;

const TEMPLATE_COLLECTION_JSON = `{
  "sections": {
    "main": {
      "type": "ds-main-collection",
      "settings": {}
    }
  },
  "order": ["main"]
}`;

const SNIPPETS: ReadonlyArray<{ path: string; content: string }> = [
  { path: "snippets/ds-badge.liquid", content: SNIPPET_BADGE },
  { path: "snippets/ds-price.liquid", content: SNIPPET_PRICE },
  { path: "snippets/ds-variant-select.liquid", content: SNIPPET_VARIANT_SELECT },
  { path: "snippets/ds-buy-button.liquid", content: SNIPPET_BUY_BUTTON },
  { path: "snippets/ds-product-card.liquid", content: SNIPPET_PRODUCT_CARD },
  { path: "snippets/ds-announcement.liquid", content: SNIPPET_ANNOUNCEMENT },
  { path: "snippets/ds-newsletter.liquid", content: SNIPPET_NEWSLETTER },
  { path: "snippets/ds-pagination.liquid", content: SNIPPET_PAGINATION },
  { path: "sections/ds-header.liquid", content: SECTION_HEADER },
  { path: "sections/ds-footer.liquid", content: SECTION_FOOTER },
  { path: "sections/ds-hero.liquid", content: SECTION_HERO },
  { path: "sections/ds-rich-text.liquid", content: SECTION_RICH_TEXT },
  { path: "sections/ds-image-with-text.liquid", content: SECTION_IMAGE_WITH_TEXT },
  { path: "sections/ds-multicolumn.liquid", content: SECTION_MULTICOLUMN },
  { path: "sections/ds-contact.liquid", content: SECTION_CONTACT },
  { path: "sections/ds-faq.liquid", content: SECTION_FAQ },
  { path: "sections/ds-featured-collection.liquid", content: SECTION_FEATURED_COLLECTION },
  { path: "sections/ds-main-product.liquid", content: SECTION_MAIN_PRODUCT },
  { path: "sections/ds-main-collection.liquid", content: SECTION_MAIN_COLLECTION },
  { path: "sections/ds-main-page.liquid", content: SECTION_MAIN_PAGE },
  { path: "sections/ds-main-cart.liquid", content: SECTION_MAIN_CART },
  { path: "sections/ds-main-search.liquid", content: SECTION_MAIN_SEARCH },
  { path: "sections/ds-main-404.liquid", content: SECTION_MAIN_404 },
  { path: "sections/header-group.json", content: HEADER_GROUP_JSON },
  { path: "sections/footer-group.json", content: FOOTER_GROUP_JSON },
  { path: "templates/index.json", content: TEMPLATE_INDEX_JSON },
  { path: "templates/product.json", content: TEMPLATE_PRODUCT_JSON },
  { path: "templates/collection.json", content: TEMPLATE_COLLECTION_JSON },
  { path: "templates/page.json", content: TEMPLATE_PAGE_JSON },
  { path: "templates/cart.json", content: TEMPLATE_CART_JSON },
  { path: "templates/search.json", content: TEMPLATE_SEARCH_JSON },
  { path: "templates/404.json", content: TEMPLATE_404_JSON },
  { path: "templates/product.ds.json", content: TEMPLATE_PRODUCT_JSON },
  { path: "templates/collection.ds.json", content: TEMPLATE_COLLECTION_JSON },
];

export const SHOPIFY_KIT_CONDUCT_MD = [
  "## Shopify implementation guidance (mandatory)",
  "Use Better Design's `get-shopify-guide` MCP tool for Liquid and Online Store 2.0 guidance. The guidance is served directly by this MCP; do not install a separate agent skill.",
  "- Before changing any returned `.liquid`, JSON template, schema, locale, or asset file, call `get-shopify-guide` with the exact task or unfamiliar Shopify object, tag, filter, or validation error. Do not rely on memory for Shopify APIs.",
  "- Start with `get-shopify-guide({ topic: \"shopify-workflow-validation\" })` for the safe theme workflow. Use a query for focused retrieval and follow the linked Shopify primary reference when an API is version-sensitive.",
  "- After writing files, run `shopify theme check --path <absolute-theme-path>`. Fix every reported error, query `get-shopify-guide` with unfamiliar errors, then run Theme Check again.",
  "- Resolve page-only versus full-storefront scope before installing any files. Preserve the selected tokens and real `ds-*` components; do not treat this full-storefront kit as page-scoped.",
  "",
  SHOPIFY_PAGE_SCOPE_CONTRACT,
  "",
  "## Full-storefront installation only (mandatory order)",
  "Follow this installation only when the user requested a full-storefront build. For page-only work, follow the isolation gate above instead; do not run these steps.",
  "1. Duplicate the merchant's theme and work only in the unpublished copy. This full-store kit replaces the default header/footer groups and primary storefront templates; never install it directly on the live theme.",
  "2. Write every returned file to its exact path. That includes the CSS asset, snippets, Liquid sections, `sections/header-group.json`, `sections/footer-group.json`, and the primary `templates/*.json` files. Copy contents VERBATIM; retyped Liquid silently drops this system's material.",
  "3. Load the stylesheet once in `layout/theme.liquid`, before `</head>`: `{{ 'ds-kit.css' | asset_url | stylesheet_tag }}`.",
  "4. In `layout/theme.liquid`, confirm the theme renders `{% sections 'header-group' %}` and `{% sections 'footer-group' %}`; the generated group files become global only through those calls.",
  "   - If the theme uses different group names, rename the generated group files and call them with `{% sections '<group-name>' %}`.",
  "   - If it renders header/footer sections directly, replace those calls with the generated group calls, or use `{% section 'ds-header' %}` and `{% section 'ds-footer' %}` without group-editor support.",
  "5. The generated index, product, collection, page, cart, search, and 404 templates make the selected system the storefront default; `product.ds` and `collection.ds` remain available as alternate templates for compatibility.",
  "6. Open the unpublished theme editor. Select a featured product or hero image, replace the starter copy, verify menus and policies, then review desktop and mobile. Publishing is a separate authorized action, not part of installation.",
  "",
  "## Class contract (pass/fail)",
  "- Do not rename `ds-*` classes and do not strip the `ds ds-embed` wrapper a snippet renders on its root; the wrapper scopes this system's tokens and keeps the background transparent inside existing theme sections.",
  "- Custom CSS is layout-only (position, spacing, grid). Never restyle a `ds-*` component's geometry or surface; those carry this system's identity.",
  `- ${HOVER_POLICY}`,
  `- Every visible text color keeps at least ${MINIMUM_TEXT_CONTRAST} contrast against its computed background. Colors come from the system's tokens, never invented values.`,
  "",
  "## Commerce correctness",
  "- `ds-buy-button` works without JavaScript on every product: multi-variant products get a native variant dropdown automatically, or pass `variant_id` to pin one. The product card's quick add links to the product page for multi-variant products.",
  "- Without JavaScript the displayed price and image do not update when a shopper changes the variant dropdown; the correct variant is still added to the cart, and cart and checkout show its real price. State this to merchants rather than papering over it.",
  "- Prices always render through the `money` filter, never hand-formatted.",
  "- Images always render through `image_url` with explicit widths; `img_url` is deprecated.",
  "",
  "## Not in this kit, on purpose",
  "Nothing here ships JavaScript. Sliding cart drawers, live variant image swapping, and instant search need scripts, and every theme already has its own; competing scripts are the least portable surface in Shopify. The kit's forms, dropdowns, quantity fields, accordions, and pagination all work as native HTML.",
  "FAQ fidelity: `snippets/ds-faq-item.liquid` is included only when the compiler recognizes the system's accordion slots and has a disclosure icon in the selected family and variant. Use that snippet for page-only FAQ sections. If it is absent, `sections/ds-faq.liquid` is a generic native fallback, not a faithful copy of the system's accordion. The adapter preserves authored styling and chevron motion; native content disclosure does not reproduce Radix height animation or controlled state APIs.",
].join("\n");

function fence(lang: string, body: string): string {
  return `\`\`\`${lang}\n${body}\n\`\`\``;
}

function pointerSafeMaterialCss(css: string | undefined): string | undefined {
  const lines = css?.trim().split("\n");
  if (!lines?.length) return undefined;

  // buildDsComponentCss emits one translated selector block per line. Keep its
  // authored hover material, but only expose that feedback to a primary input
  // that can actually hover; touch keeps the resting and :active states.
  const hoverRules = lines.filter((line) => line.includes(":hover"));
  const baseRules = lines.filter((line) => !line.includes(":hover"));
  if (hoverRules.length) {
    baseRules.push(`@media (hover:hover) and (pointer:fine){${hoverRules.join("\n")}}`);
  }
  return baseRules.join("\n").trim() || undefined;
}

function primaryButtonTextCss(css: string | undefined): string | undefined {
  if (!css) return undefined;

  let foreground: string | undefined;
  for (const match of css.matchAll(/\.ds-btn(?:-primary)?\s*\{([^}]*)\}/g)) {
    for (const color of match[1]?.matchAll(/(?:^|;)\s*color\s*:\s*([^;}]+)/g) ?? []) {
      foreground = color[1]?.trim() ?? foreground;
    }
  }
  return foreground
    ? `.ds.ds-embed .ds-btn-primary{color:${foreground}!important;-webkit-text-fill-color:currentColor}`
    : undefined;
}

function requireShopifyIcons(icons: DesignSystemIconPresentation | undefined): DesignSystemIconPresentation {
  if (!icons) throw new Error("Shopify icons unavailable: no icon library was selected");
  return icons;
}

/** Full-store theme files: per-DS CSS plus shared snippets, sections, groups, and templates. */
export function buildDsShopifyFiles(input: Pick<DsShopifyKitInput, "tokensCss" | "componentKit"> & { iconLibrary: DesignSystemIconPresentation; accordion?: ShopifyAccordionAdapter | null }): ThemeFile[] {
  const icons = requireShopifyIcons(input.iconLibrary);
  const materialCss = pointerSafeMaterialCss(input.componentKit?.css);
  const primaryTextCss = primaryButtonTextCss(materialCss);
  const assetCss = [
    compactTokensCss(input.tokensCss),
    DS_KIT_CSS,
    DS_SHOPIFY_CSS,
    ...(materialCss ? [materialCss] : []),
    ...(primaryTextCss ? [primaryTextCss] : []),
    ...(input.accordion ? [pointerSafeMaterialCss(input.accordion.css)] : []),
  ].join("\n\n");
  return [
    { path: "assets/ds-kit.css", content: assetCss },
    { path: "snippets/ds-icon.liquid", content: buildShopifyIconSnippet(icons) },
    ...SNIPPETS.map((file) => input.accordion && file.path === "sections/ds-faq.liquid"
      ? { ...file, content: file.content.replace(FAQ_CARD_ITEM, faqItemMarkup("block.settings.question", "block.settings.answer", "block.shopify_attributes")) }
      : file),
    ...(input.accordion ? [faqItemSnippet()] : []),
  ];
}

/** Format the Shopify kit with conduct before file blocks so truncation cannot hide it. */
export function buildDsShopifyKit({ name, tokensCss, viewUrl, source, componentKit, themeFiles, iconLibrary }: DsShopifyKitInput & ({ themeFiles: ThemeFile[] } | { iconLibrary: DesignSystemIconPresentation })): string {
  const files = themeFiles ?? buildDsShopifyFiles({ tokensCss, componentKit, iconLibrary: requireShopifyIcons(iconLibrary) });
  const sourceLine =
    source?.kind === "catalog"
      ? `Source designSystemId: \`${source.designSystemId}\``
      : source?.kind === "project"
        ? `Source projectId: \`${source.projectId}\``
        : null;
  const fileBlocks = files.flatMap((f) => [
    `### \`${f.path}\``,
    "",
    fence(f.path.endsWith(".css") ? "css" : f.path.endsWith(".json") ? "json" : "liquid", f.content),
    "",
  ]);
  return [
    `# ${name}: Shopify theme kit`,
    "",
    "Full design system for an Online Store 2.0 theme: one CSS asset carries this system's real tokens and component material, while the Liquid snippets, global header/footer groups, and primary storefront templates compose the full store with no JavaScript. Follow the scope gate below before writing any file; this is not a page-scoped kit.",
    ...(sourceLine ? ["", sourceLine] : []),
    "",
    SHOPIFY_KIT_CONDUCT_MD,
    "",
    "## Theme files",
    "",
    ...fileBlocks,
    "## After installing",
    "- Preview an unpublished copy of the theme first; never edit the live theme directly.",
    "- The kit owns the storefront composition and cart page; Shopify continues to own checkout.",
    ...(viewUrl ? ["", `Full live showcase: ${viewUrl}`] : []),
  ].join("\n");
}
