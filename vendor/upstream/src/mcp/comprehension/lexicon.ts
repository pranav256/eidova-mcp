// Word lists for the comprehension check. Deliberately conservative: every term
// here is one a person outside the team can read without knowing the product,
// the codebase, or the growth model. A hit is a prompt to reword or define the
// term on the screen, not proof the copy is wrong. [BD-268]

/** Technical or operational vocabulary that leaks out of engineering docs. */
export const TECHNICAL_TERMS = [
  "api", "async", "auth", "backfill", "cache", "cdn", "config", "cron",
  "deploy", "endpoint", "entity", "idempotent", "ingest", "instance",
  "latency", "metadata", "migrate", "namespace", "oauth", "params", "payload",
  "provision", "queue", "quota", "rate limit", "schema", "sdk", "session",
  "sso", "sync", "telemetry", "tenant", "throughput", "token", "upsert",
  "webhook", "workspace",
];

/** Growth, gamification, and billing vocabulary that only insiders decode. */
export const PRODUCT_TERMS = [
  "badge", "boost", "cohort", "combo", "credits", "funnel", "gem", "league",
  "milestone", "perk", "power-up", "quest", "referral", "retention", "seat",
  "streak", "tier", "unlock", "xp",
];

/** Acronyms an average reader already knows, so they never need expanding. */
export const KNOWN_ACRONYMS = new Set([
  "AM", "PM", "OK", "ID", "PDF", "FAQ", "USD", "EUR", "GBP", "US", "UK", "TV",
  "AI", "CEO", "DIY", "GPS", "HD", "SMS", "URL",
]);

/** Common short words remain words when a heading uses uppercase typography. */
export const UPPERCASE_WORDS = new Set(
  'about above after again all also an and any are as at back be been before best both but by can clip clips copy could day do does each end every find first for free from full get give go good great had has have help here how if in into is it its just keep last left less let like long look made make many may me more most much my need new no nor not now of off on one only open or other our out own page parts people price read right same save see set short should show side so some start still take text than that the their them then there these they thing this time to too top two up use user users video view want was way we well were what when which who why will with work would yes you your'.split(' '),
);

/**
 * Button labels that survive the screenshot test only because the reader
 * already knows the flow. None of them say what happens next.
 */
export const VAGUE_ACTIONS = new Set([
  "click here", "continue", "done", "get started", "go", "got it", "here",
  "learn more", "next", "ok", "okay", "proceed", "read more", "see more",
  "start", "submit", "try it", "yes",
]);

/** A sentence longer than this is hard to hold in one reading. */
export const MAX_SENTENCE_WORDS = 25;

/** Total visible words above which a screen becomes a reading task. */
export const MAX_SCREEN_WORDS = 60;

/** Actions above which the screen stops having one obvious next step. */
export const MAX_ACTIONS = 3;

/** The explain-it-out-loud budget the 15-second test enforces. */
export const EXPLAIN_BUDGET_SECONDS = 15;

/**
 * A slide is read from across a room while someone talks, so it gets a tighter
 * word budget than a screen. Heuristics, not measurements of an audience. [BD-593]
 */
export const MAX_SLIDE_WORDS = 40;

/** Lines of supporting copy above which a slide usually carries more than one idea. */
export const MAX_SLIDE_LINES = 5;

/** A screen named like this is checked as a slide unless the caller says otherwise. */
export const SLIDE_NAME = /\b(slides?|deck|presentation)\b/i;
