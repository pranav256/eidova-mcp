/**
 * Original Eidova guidance. The field shapes follow the published MCP
 * client's Principle and ReviewRule contracts, not its hosted content corpus.
 * Retrieval is local lexical ranking; no model, telemetry or network is used.
 */

import { loadContentLibrary } from './content-library.js';
import { resourcePath } from './resources.js';

export type PrincipleArea =
  | "ui" | "ux" | "react-native" | "swiftui" | "three-js"
  | "shopify" | "sales" | "motion" | "widget" | "illustration";

export interface Principle {
  id: string;
  title: string;
  content: string;
  area: PrincipleArea;
  topic: string;
  aliases: string[];
  sourceFile: string;
  chunkType: "parent";
}

export interface PrincipleListItem {
  id: string;
  title: string;
  topic: string;
  aliases: string[];
}

export interface PrincipleSearchResult extends Principle { matchScore: number }
export type ReviewCategory = "accessibility" | "visual-design" | "animation" | "content" | "comprehension" | "ai-features" | "coverage-gaps";
export interface ReviewRule {
  id: string;
  title: string;
  content: string;
  category: ReviewCategory;
  severity: "critical" | "serious" | "moderate";
}

export const GUIDANCE_PROVENANCE = {
  author: "Eidova contributors and authorized library owners",
  source: "Editable local library; original seed guidance and owner-managed imports",
  license: "MIT for the original seed; retain the rights of imported material",
  retrieval: "lexical",
  limitations: "General engineering guidance; validate decisions with real users and rendered evidence. Automated checks do not certify accessibility.",
} as const;

const library = await loadContentLibrary((process.env.EIDOVA_CONTENT_LIBRARY ?? process.env.OPEN_DESIGN_CONTENT_LIBRARY) ?? resourcePath('content/library.json'));
const corpus: Principle[] = library.principles;
const reviewCorpus: ReviewRule[] = library.reviewRules;

// Keep the seed data private and return copies so a caller cannot alter the
// guidance seen by the next client in a shared, long-lived process.
export const principles: readonly Principle[] = Object.freeze(corpus.map(entry => Object.freeze({ ...entry, aliases: Object.freeze([...entry.aliases]) as unknown as string[] })));
export const reviewRules: readonly ReviewRule[] = Object.freeze(reviewCorpus.map(entry => Object.freeze({ ...entry })));

const normalize = (value: string): string => value.normalize("NFKC").toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "the", "this", "to", "use", "with"]);
const terms = (value: string): string[] => [...new Set(value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(term => !stopWords.has(term));
const safeLimit = (limit: number): number => Number.isFinite(limit) ? Math.min(50, Math.max(0, Math.floor(limit))) : 5;
const copy = <T>(value: T): T => structuredClone(value);

export async function listPrinciples(area?: PrincipleArea): Promise<PrincipleListItem[]> {
  return principles.filter(entry => !area || entry.area === area).map(({ id, title, topic, aliases }) => ({ id, title, topic, aliases: [...aliases] }));
}

export async function getPrincipleByTopic(topic: string, area?: PrincipleArea): Promise<Principle | null> {
  const wanted = normalize(topic);
  if (!wanted) return null;
  const candidates = principles.filter(entry => !area || entry.area === area);
  const exact = candidates.find(entry => normalize(entry.topic) === wanted || normalize(entry.id) === wanted);
  if (exact) return copy(exact);
  const matches = candidates.filter(entry => entry.aliases.some(alias => normalize(alias) === wanted));
  // Ambiguous aliases without an area must not silently select another domain.
  return matches.length === 1 ? copy(matches[0]) : null;
}

export async function searchPrinciples(query: string, limit = 5, area?: PrincipleArea): Promise<PrincipleSearchResult[]> {
  const queryTerms = terms(query);
  if (!queryTerms.length || !safeLimit(limit)) return [];
  const normalizedQuery = normalize(query);
  const scored = principles.filter(entry => !area || entry.area === area).map(entry => {
    const title = new Set(terms(`${entry.topic} ${entry.title}`));
    const aliases = new Set(terms(entry.aliases.join(" ")));
    const body = new Set(terms(entry.content));
    const exact = [entry.topic, ...entry.aliases].some(value => normalize(value) === normalizedQuery);
    let hitCount = 0;
    let weighted = 0;
    for (const term of queryTerms) {
      const hit = title.has(term) || aliases.has(term) || body.has(term);
      if (hit) hitCount += 1;
      weighted += title.has(term) ? 6 : aliases.has(term) ? 5 : body.has(term) ? 1 : 0;
    }
    const rank = exact ? 100 + weighted : weighted;
    const matchScore = exact ? 100 : Math.min(99, Math.round(60 * hitCount / queryTerms.length + 39 * weighted / (6 * queryTerms.length)));
    return { entry, rank, matchScore };
  }).filter(result => result.rank > 0).sort((a, b) => b.rank - a.rank || a.entry.id.localeCompare(b.entry.id));
  return scored.slice(0, safeLimit(limit)).map(({ entry, matchScore }) => ({ ...copy(entry), matchScore }));
}

export async function getReviewRules(category: string = "all"): Promise<ReviewRule[]> {
  return reviewRules.filter(entry => category === "all" || entry.category === category).map(entry => copy(entry));
}
