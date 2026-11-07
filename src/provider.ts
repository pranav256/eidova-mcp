import { createHash } from 'node:crypto';
import { searchCatalog, systemWithComponents } from './catalog.js';
import { iconLibrary, iconNames } from './icons.js';
import { listPrinciples, getPrincipleByTopic, searchPrinciples, getReviewRules } from './guidance.js';
import type { JsonStore } from './store.js';

export function workspaceId(key?: string, local = false) {
  if (local && !key) return 'local';
  if (!key) return undefined;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(key)) throw new Error('Workspace key must be 43–128 base64url characters. Generate it from 32 random bytes.');
  return createHash('sha256').update(key).digest('hex');
}

export function createProvider(store: JsonStore, identity?: string) {
  return {
    searchDesignSystems: searchCatalog,
    getDesignSystemById: systemWithComponents,
    listPrinciples, getPrincipleByTopic, searchPrinciples, getReviewRules,
    getRecentGuidance: async () => [],
    getTeamRules: async () => identity ? (await store.get<{markdown: string}>(`workspaces/${identity}/rules`))?.markdown ?? '' : '',
    searchIconLibraries: async () => [await iconLibrary()],
    getIconLibraryById: async (id: string) => id === 'lucide' ? iconLibrary() : null,
    searchIconsInLibrary: async (query: string, library: {id: string}, _variant?: string, limit = 15) => library.id === 'lucide' ? iconNames(query, limit) : [],
    ...(identity ? {
      saveTeamRules: async (_user: unknown, markdown: string, replaceExisting: boolean) => {
        await store.update<{markdown: string; updatedAt: string}>(`workspaces/${identity}/rules`, current => {
          if (current?.markdown && current.markdown !== markdown && !replaceExisting) throw new Error('Different team rules already exist; review them before replacing.');
          return {markdown, updatedAt: new Date().toISOString()};
        });
        return 'saved' as const;
      },
    } : {}),
  };
}
