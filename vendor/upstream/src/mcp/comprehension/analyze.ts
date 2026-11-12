// The comprehension check: three tests a screen must survive before an agent
// presents it. Deterministic on purpose, so the same screen always returns the
// same findings and the rules can be unit tested. [BD-268]

import { extractScreenCopy } from "./extract";
import {
  EXPLAIN_BUDGET_SECONDS,
  KNOWN_ACRONYMS,
  MAX_ACTIONS,
  MAX_SCREEN_WORDS,
  MAX_SENTENCE_WORDS,
  MAX_SLIDE_LINES,
  MAX_SLIDE_WORDS,
  PRODUCT_TERMS,
  SLIDE_NAME,
  TECHNICAL_TERMS,
  UPPERCASE_WORDS,
  VAGUE_ACTIONS,
} from "./lexicon";

/**
 * The tests a report groups findings under. "slide" runs only on a slide, and
 * "brand" only when the team's rules ban words. [BD-1015]
 */
export type ComprehensionTest = "mom" | "fifteen-second" | "screenshot" | "slide" | "brand";
/** A slide gets the slide test and never passes on text alone. [BD-593] */
export type ComprehensionSurface = "screen" | "slide" | "reference";
export type ComprehensionSeverity = "critical" | "serious" | "minor";

export interface ComprehensionFinding {
  test: ComprehensionTest;
  severity: ComprehensionSeverity;
  problem: string;
  evidence: string;
  fix: string;
}

export interface ComprehensionInput {
  /** What the screen is, in the agent's words. Used in the report header. */
  screen: string;
  headline?: string;
  body?: string[];
  actions?: string[];
  /** JSX, TSX, or HTML for the screen. Copy is extracted when the fields above are absent. */
  code?: string;
  /** Words the audience already knows, so the check stops flagging them. */
  knownTerms?: string[];
  /** Words the team's rules ban. Each one the copy uses is a finding. [BD-1015] */
  bannedTerms?: string[];
  /** Defaults to "slide" when the screen name says slide, deck or presentation. */
  surface?: ComprehensionSurface;
}

export interface ComprehensionReport {
  screen: string;
  surface: ComprehensionSurface;
  /** A slide with no blocking finding gets "needs-screenshot", never "pass". */
  verdict: "pass" | "revise" | "needs-screenshot";
  /** True when the copy was held to banned words, so the report shows the brand test. */
  brandChecked: boolean;
  findings: ComprehensionFinding[];
  copy: { headline: string | null; body: string[]; actions: string[] };
  stats: {
    words: number;
    budgetWords: number;
    insiderTerms: string[];
    actionCount: number;
    longestSentenceWords: number;
    estimatedExplainSeconds: number;
  };
}

const WORD_BOUNDARY_SAFE = /[.*+?^${}()|[\]\\]/g;

function termPattern(term: string): RegExp {
  return new RegExp(`\\b${term.replace(WORD_BOUNDARY_SAFE, "\\$&")}s?\\b`, "i");
}

/** Trimmed, lowercased and without repeats, so a list matches in any case. */
function normalizeTerms(terms: string[] = []): string[] {
  return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Search fields, filters and sort controls narrow what the screen shows;
 * they do not compete for the next step, so they never count as actions. [BD-1151]
 */
const NOT_AN_ACTION = /^(?:search|filter|sort|all|any)\b/i;

function resolveCopy(input: ComprehensionInput) {
  const extracted = input.code ? extractScreenCopy(input.code) : null;
  return {
    headline: input.headline?.trim() || extracted?.headline || null,
    body: input.body?.length ? input.body : extracted?.body ?? [],
    actions: (input.actions?.length ? input.actions : extracted?.actions ?? []).filter((a) => !NOT_AN_ACTION.test(a.trim())),
    unlabelledControls: extracted?.unlabelledControls ?? 0,
  };
}

function findInsiderTerms(text: string, known: Set<string>): string[] {
  return [...TECHNICAL_TERMS, ...PRODUCT_TERMS]
    .filter((term) => !known.has(term) && termPattern(term).test(text));
}

function findBareAcronyms(text: string, known: Set<string>): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const acronym = match[0];
    if (KNOWN_ACRONYMS.has(acronym) || UPPERCASE_WORDS.has(acronym.toLowerCase()) || known.has(acronym.toLowerCase())) continue;
    // An expansion in brackets right after the acronym counts as explained.
    if (new RegExp(`\\(${acronym}\\)`).test(text)) continue;
    found.add(acronym);
  }
  return [...found];
}

function momTestFindings(text: string, known: Set<string>, insiderTerms: string[]): ComprehensionFinding[] {
  const findings: ComprehensionFinding[] = [];

  if (insiderTerms.length > 0) {
    findings.push({
      test: "mom",
      severity: insiderTerms.length > 1 ? "serious" : "minor",
      problem: "The copy uses words that only make sense inside the team.",
      evidence: insiderTerms.join(", "),
      fix: "Say what the thing does in everyday words, or explain the term on the screen the first time it appears.",
    });
  }

  const acronyms = findBareAcronyms(text, known);
  if (acronyms.length > 0) {
    findings.push({
      test: "mom",
      severity: "serious",
      problem: "An acronym appears without being spelled out.",
      evidence: acronyms.join(", "),
      fix: "Write the words in full the first time, or drop the acronym.",
    });
  }

  const longest = sentences(text).sort((a, b) => countWords(b) - countWords(a))[0];
  if (longest && countWords(longest) > MAX_SENTENCE_WORDS) {
    findings.push({
      test: "mom",
      severity: "serious",
      problem: `A sentence runs to ${countWords(longest)} words, so the reader loses the thread.`,
      evidence: longest,
      fix: `Split it into sentences of about 15 to 20 words, one idea each.`,
    });
  }

  return findings;
}

/** One finding that lists every banned word the copy uses. [BD-1015] */
function brandFindings(text: string, banned: string[]): ComprehensionFinding[] {
  const used = banned.filter((term) => termPattern(term).test(text));
  if (used.length === 0) return [];
  return [{
    test: "brand",
    severity: "serious",
    problem: "The copy uses a word the team's rules ban.",
    evidence: used.join(", "),
    fix: "Use the word the team's rules give instead. get-team-rules lists both.",
  }];
}

/**
 * A rough proxy for how long it takes to explain the screen out loud: speaking
 * the copy at about 3 words a second, plus a sentence to define each insider
 * term and a clause for each extra choice. A heuristic budget, not a
 * measurement of real users.
 */
export function estimateExplainSeconds(
  words: number,
  insiderTermCount: number,
  actionCount: number,
): number {
  const speaking = words / 3;
  const defining = insiderTermCount * 5;
  const choosing = Math.max(0, actionCount - 1) * 3;
  return Math.round(speaking + defining + choosing);
}

function fifteenSecondFindings(
  words: number,
  actions: string[],
  seconds: number,
  surface: ComprehensionSurface,
): ComprehensionFinding[] {
  const findings: ComprehensionFinding[] = [];

  if (seconds > EXPLAIN_BUDGET_SECONDS) {
    findings.push({
      test: "fifteen-second",
      severity: "serious",
      problem: `A newcomer needs about ${seconds} seconds to understand this screen; aim for ${EXPLAIN_BUDGET_SECONDS} or less.`,
      evidence: `${words} words, ${actions.length} action${actions.length === 1 ? "" : "s"}`,
      fix: "Cut to one idea and one next step. Move the rest behind a link or a later screen.",
    });
  }

  // A slide has its own, tighter word budget in the slide test.
  if (surface !== "slide" && words > MAX_SCREEN_WORDS) {
    findings.push({
      test: "fifteen-second",
      severity: "serious",
      problem: `The screen shows ${words} words, so people read it like a page of text instead of scanning it.`,
      evidence: `${words} words of visible copy`,
      fix: `Keep the screen under about ${MAX_SCREEN_WORDS} words and let the interface carry the rest.`,
    });
  }

  if (actions.length > MAX_ACTIONS) {
    findings.push({
      test: "fifteen-second",
      severity: "serious",
      problem: `The screen offers ${actions.length} actions, so there is no obvious next step.`,
      evidence: actions.join(" | "),
      fix: `Keep one primary action and at most ${MAX_ACTIONS - 1} secondary ones.`,
    });
  }

  return findings;
}

function screenshotFindings(
  copy: ReturnType<typeof resolveCopy>,
  words: number,
): ComprehensionFinding[] {
  const findings: ComprehensionFinding[] = [];

  if (!copy.headline) {
    findings.push({
      test: "screenshot",
      severity: "critical",
      problem: "The screen has no title, so a stranger cannot name what they are looking at.",
      evidence: "no heading found",
      fix: "Add a title that says what this screen is, in the words a user would use.",
    });
  }

  const vague = copy.actions.filter((action) => VAGUE_ACTIONS.has(action.trim().toLowerCase()));
  if (vague.length > 0) {
    findings.push({
      test: "screenshot",
      severity: "serious",
      problem: "An action does not say what happens when you press it.",
      evidence: vague.join(", "),
      fix: "Name the outcome, for example Save changes, Start the lesson, Delete this project.",
    });
  }

  if (copy.unlabelledControls > 0) {
    findings.push({
      test: "screenshot",
      severity: "critical",
      problem: `${copy.unlabelledControls} control${copy.unlabelledControls > 1 ? "s show" : " shows"} an icon with no words.`,
      evidence: "icon-only button or link without a visible label or accessible name",
      fix: "Add a visible label, or an aria-label plus a tooltip, so the icon is not the only clue.",
    });
  }

  if (copy.headline && words <= countWords(copy.headline) && copy.actions.length === 0) {
    findings.push({
      test: "screenshot",
      severity: "minor",
      problem: "The screen is a title with nothing else, so its purpose is a guess.",
      evidence: copy.headline,
      fix: "Add one supporting line saying what the user can do here.",
    });
  }

  return findings;
}

function slideFindings(words: number, body: string[]): ComprehensionFinding[] {
  const findings: ComprehensionFinding[] = [];

  if (words > MAX_SLIDE_WORDS) {
    findings.push({
      test: "slide",
      severity: "serious",
      problem: `The slide shows ${words} words, so the audience reads instead of listening.`,
      evidence: `${words} words of visible copy`,
      fix: `Keep a slide under about ${MAX_SLIDE_WORDS} words: a title that states the point and a few short lines.`,
    });
  }

  if (body.length > MAX_SLIDE_LINES) {
    findings.push({
      test: "slide",
      severity: "serious",
      problem: `The slide stacks ${body.length} lines of copy, which usually means more than one idea.`,
      evidence: body.join(" | "),
      fix: "Give each idea its own slide, with the point in the title.",
    });
  }

  return findings;
}

export function analyzeComprehension(input: ComprehensionInput): ComprehensionReport {
  const surface = input.surface ?? (SLIDE_NAME.test(input.screen) ? "slide" : "screen");
  const copy = resolveCopy(input);
  const banned = normalizeTerms(input.bannedTerms);
  const known = new Set(normalizeTerms(input.knownTerms));
  const visible = [copy.headline ?? "", ...copy.body, ...copy.actions].join(". ");
  const words = countWords(visible);

  const insiderTerms = findInsiderTerms(visible, known);
  // Reference data is read on demand; the title and actions still orient newcomers.
  const orientation = [copy.headline ?? "", ...copy.actions].join(". ");
  const budgetWords = surface === "reference" ? countWords(orientation) : words;
  const budgetTerms = surface === "reference" ? findInsiderTerms(orientation, known) : insiderTerms;
  const estimatedExplainSeconds = estimateExplainSeconds(budgetWords, budgetTerms.length, copy.actions.length);

  const findings = [
    ...momTestFindings(visible, known, insiderTerms),
    ...fifteenSecondFindings(budgetWords, copy.actions, estimatedExplainSeconds, surface),
    ...screenshotFindings(copy, words),
    ...(surface === "slide" ? slideFindings(words, copy.body) : []),
    ...brandFindings(visible, banned),
  ];
  const blocking = findings.some((finding) => finding.severity !== "minor");

  const longestSentence = sentences(visible).sort((a, b) => countWords(b) - countWords(a))[0] ?? "";

  return {
    screen: input.screen,
    surface,
    verdict: blocking ? "revise" : surface === "slide" ? "needs-screenshot" : "pass",
    brandChecked: banned.length > 0,
    findings,
    copy: { headline: copy.headline, body: copy.body, actions: copy.actions },
    stats: {
      words,
      budgetWords,
      insiderTerms,
      actionCount: copy.actions.length,
      longestSentenceWords: countWords(longestSentence),
      estimatedExplainSeconds,
    },
  };
}
