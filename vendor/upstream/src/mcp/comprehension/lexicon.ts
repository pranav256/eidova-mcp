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
