// The ChatGPT design panel frames one web page to draw the same design-system
// preview cards as the website. The panel and that page share these names.

/** The web page that draws the cards: the catalog, or the project versions in `?projects=`. */
export const PREVIEW_CARDS_PATH = "/embed/design-systems";

/** The most project versions one card page draws. */
export const PREVIEW_CARDS_MAX_PROJECTS = 24;

/**
 * The postMessage types the card page and the panel trade. The page says it is
 * ready, reports its height and asks to open a card; the panel answers with the
 * cards to show, in order, with the labels it already holds.
 */
export const PREVIEW_CARDS_MESSAGE = {
  ready: "better-design:cards-ready",
  height: "better-design:cards-height",
  open: "better-design:cards-open",
  show: "better-design:cards-show",
} as const;
