import { createHash, randomUUID } from 'node:crypto';
import type { JsonStore } from './store.js';

// Compatibility contract from the MIT-licensed better-design@0.49.1 package:
// shared/src/project-rules.ts and shared/src/schema.ts (BD-1052/BD-1056).
export const PROJECT_RULE_MAX_BYTES = 4 * 1024;
export const TEAM_RULES_MAX_BYTES = 32 * 1024;
export const PROJECT_RULE_NAME_MAX_CHARS = 120;
export const PROJECT_RULES_MAX_PER_PROJECT = 500;
export const projectRuleKinds = ['guidelines', 'use', 'never', 'pairing', 'spec'] as const;
export type ProjectRuleKind = typeof projectRuleKinds[number];
export type ProjectRuleInput = { kind?: ProjectRuleKind; screen?: string; part?: string; markdown: string };
export type ProjectRuleEntry = { kind: ProjectRuleKind; screen: string; part: string; markdown: string };
export type ProjectRuleRequest = { screen?: string; parts?: readonly string[] };
export type ProjectScreenContext = { guidelines: string; rules: ProjectRuleEntry[]; specs: ProjectRuleEntry[]; otherParts: string[]; specScreens: string[] };
export type ProjectRuleSaveOutcome = 'saved' | 'refused';

type RuleReference = { slot: string; revision: string; digest: string };
type RuleManifest = { owner: string; records: RuleReference[] };
type RuleRevision = { owner: string; entry: ProjectRuleEntry };
class RuleRefused extends Error {}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function normalizeName(value?: string): string {
  if (value !== undefined && typeof value !== 'string') throw new TypeError('A screen or part name must be text.');
  const name = (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (name.length > PROJECT_RULE_NAME_MAX_CHARS) throw new RangeError('A screen or part name can be 120 characters at most.');
  return name;
}

function ruleEntry(input: ProjectRuleInput): ProjectRuleEntry {
  const screen = normalizeName(input.screen);
  const part = normalizeName(input.part);
  const kind = input.kind ?? (screen ? 'spec' : part ? undefined : 'guidelines');
  if (!kind) throw new TypeError('Name the kind of rule for this part: "use", "never" or "pairing".');
  if (!projectRuleKinds.includes(kind)) throw new TypeError('Unknown project rule kind.');
  if (kind === 'spec' && !screen) throw new TypeError('A spec needs the screen it belongs to.');
  if (kind !== 'spec' && screen) throw new TypeError('Only a spec belongs to one screen.');
  if (kind === 'guidelines' && part) throw new TypeError('Guidelines cover the whole project, so they take no part.');
  if ((kind === 'use' || kind === 'pairing') && !part) throw new TypeError(`A "${kind}" rule needs the part or value it is about.`);
  if (typeof input.markdown !== 'string' || !input.markdown.trim()) throw new TypeError('A project rule needs nonempty Markdown.');
  const markdown = input.markdown.trim();
  const maximum = kind === 'guidelines' ? TEAM_RULES_MAX_BYTES : PROJECT_RULE_MAX_BYTES;
  if (Buffer.byteLength(markdown, 'utf8') > maximum) throw new RangeError(`This ${kind} slot accepts at most ${maximum} UTF-8 bytes.`);
  return { kind, screen, part, markdown };
}

function screenContext(entries: ProjectRuleEntry[], request: ProjectRuleRequest): ProjectScreenContext {
  const screen = normalizeName(request.screen);
  if (request.parts && (!Array.isArray(request.parts) || request.parts.length > 50)) throw new RangeError('Request at most 50 parts.');
  const specs = screen ? entries.filter(entry => entry.kind === 'spec' && entry.screen === screen).sort((a, b) => a.part.localeCompare(b.part)) : [];
  const wanted = new Set([...(request.parts ?? []).map(normalizeName).filter(Boolean), ...specs.map(spec => spec.part).filter(Boolean)]);
  const partRules = entries.filter(entry => ['use', 'never', 'pairing'].includes(entry.kind));
  return {
    guidelines: entries.find(entry => entry.kind === 'guidelines')?.markdown ?? '',
    rules: partRules.filter(entry => !entry.part || wanted.has(entry.part)).sort((a, b) => a.part.localeCompare(b.part) || a.kind.localeCompare(b.kind)),
    specs,
    otherParts: [...new Set(partRules.map(entry => entry.part))].filter(part => part && !wanted.has(part)).sort((a, b) => a.localeCompare(b)),
    specScreens: [...new Set(entries.filter(entry => entry.kind === 'spec').map(entry => entry.screen))].filter(name => name !== screen).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Rules are private even though the associated theme's registry is public.
 * Immutable rule documents keep all 500 slots within the store's document cap.
 * Only a successful atomic manifest update publishes a save; a failed update
 * can leave an unreachable revision, never a partially published rule.
 */
export class ProjectRulesStore {
  constructor(private readonly store: JsonStore, private readonly identity?: string) {}

  private async owned(projectId: string): Promise<string> {
    if (!this.identity) throw new Error('A workspace key is required for project rules.');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(projectId)) throw new Error('Project not found in this workspace.');
    const project = await this.store.get<{ owner: string }>(`projects/${projectId}`);
    if (!project || project.owner !== this.identity) throw new Error('Project not found in this workspace.');
    return this.identity;
  }

  private manifestKey(projectId: string): string { return `project-rules/${projectId}`; }
  private revisionKey(projectId: string, revision: string): string { return `project-rules/${projectId}/${revision}`; }

  async getContext(projectId: string, request: ProjectRuleRequest = {}): Promise<ProjectScreenContext> {
    const owner = await this.owned(projectId);
    // Validate names before starting any potentially large set of reads.
    screenContext([], request);
    const manifest = await this.store.get<RuleManifest>(this.manifestKey(projectId));
    if (!manifest) return screenContext([], request);
    if (manifest.owner !== owner) throw new Error('Project not found in this workspace.');
    if (!Array.isArray(manifest.records) || manifest.records.length > PROJECT_RULES_MAX_PER_PROJECT) throw new Error('The project rules manifest is invalid.');
    const entries: ProjectRuleEntry[] = [];
    for (let offset = 0; offset < manifest.records.length; offset += 16) {
      const batch = await Promise.all(manifest.records.slice(offset, offset + 16).map(async reference => {
        if (!/^[a-f0-9]{64}$/.test(reference.slot) || !/^[a-f0-9-]{36}$/.test(reference.revision) || !/^[a-f0-9]{64}$/.test(reference.digest)) throw new Error('The project rules manifest is invalid.');
        const revision = await this.store.get<RuleRevision>(this.revisionKey(projectId, reference.revision));
        if (!revision || revision.owner !== owner) throw new Error('A saved project rule could not be read.');
        const entry = ruleEntry(revision.entry);
        if (digest(JSON.stringify([entry.kind, entry.screen, entry.part])) !== reference.slot || digest(entry.markdown) !== reference.digest) throw new Error('A saved project rule does not match its manifest.');
        return entry;
      }));
      entries.push(...batch);
    }
    return screenContext(entries, request);
  }

  /** Called after the MCP save schema has required personApproved: true. */
  async save(projectId: string, input: ProjectRuleInput, replaceExisting = false): Promise<ProjectRuleSaveOutcome> {
    const owner = await this.owned(projectId);
    if (typeof replaceExisting !== 'boolean') throw new TypeError('replaceExisting must be a boolean.');
    const entry = ruleEntry(input);
    const slot = digest(JSON.stringify([entry.kind, entry.screen, entry.part]));
    const textDigest = digest(entry.markdown);
    const key = this.manifestKey(projectId);
    const current = await this.store.get<RuleManifest>(key);
    if (current && current.owner !== owner) throw new Error('Project not found in this workspace.');
    const previous = current?.records.find(record => record.slot === slot);
    if (previous?.digest === textDigest) return 'saved';
    if (previous && !replaceExisting) return 'refused';
    if (!previous && current && current.records.length >= PROJECT_RULES_MAX_PER_PROJECT) throw new RangeError('A project can hold at most 500 rule slots.');
    const revision = randomUUID();
    await this.store.set(this.revisionKey(projectId, revision), { owner, entry } satisfies RuleRevision);
    try {
      await this.store.update<RuleManifest>(key, manifest => {
        if (manifest && manifest.owner !== owner) throw new Error('Project not found in this workspace.');
        const records = manifest?.records ?? [];
        const prior = records.find(record => record.slot === slot);
        if (prior && prior.digest !== textDigest && !replaceExisting) throw new RuleRefused();
        if (!prior && records.length >= PROJECT_RULES_MAX_PER_PROJECT) throw new RangeError('A project can hold at most 500 rule slots.');
        const reference = { slot, revision, digest: textDigest };
        return { owner, records: prior ? records.map(record => record.slot === slot ? reference : record) : [...records, reference] };
      });
    } catch (error) {
      if (error instanceof RuleRefused) return 'refused';
      throw error;
    }
    return 'saved';
  }
}
