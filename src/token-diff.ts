import { isDeepStrictEqual } from 'node:util';
import { cssRules } from './registry-css.js';

type Entry = { scope: string; path: string[]; value: unknown; type?: string };
const darkSelectors = new Set(['.dark', ':root.dark', 'html.dark']);

function cssEntries(source: string): Entry[] {
  const scopes = new Map<string, Map<string, string>>([
    ['light', new Map()], ['dark', new Map()], ['theme', new Map()],
  ]);
  // shortcut: compare Eidova's token selectors and @theme declarations; add cascade matching for arbitrary stylesheets.
  for (const [selector, declarations] of Object.entries(cssRules(source))) {
    if (typeof declarations !== 'object') continue;
    for (const part of selector.split(',').map(value => value.trim())) {
      const scope = part === ':root' ? 'light' : darkSelectors.has(part) ? 'dark' : /^@theme(?:\s|$)/.test(part) ? 'theme' : '';
      if (!scope) continue;
      for (const [name, value] of Object.entries(declarations)) {
        if (name.startsWith('--') && typeof value === 'string') scopes.get(scope)!.set(name, value);
      }
    }
  }
  return [...scopes].flatMap(([scope, tokens]) => [...tokens].map(([name, value]) => ({ scope, path: [name], value })));
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dtcgEntries(source: string): Entry[] {
  const document: unknown = JSON.parse(source);
  if (!object(document)) throw new Error('Expected a DTCG token document.');
  const entries: Entry[] = [];
  function collect(group: Record<string, unknown>, path: string[], inheritedType?: string, inheritedScope = 'light') {
    if (path.length > 64) throw new Error('DTCG groups are nested too deeply.');
    const type = typeof group.$type === 'string' ? group.$type : inheritedType;
    const ext = object(group.$extensions) ? (group.$extensions as Record<string, unknown>) : undefined;
    const isDark = ext?.['io.eidova.mode'] === 'dark';
    const scope = isDark ? 'dark' : inheritedScope;
    for (const [key, node] of Object.entries(group)) {
      if (key.startsWith('$') || !object(node)) continue;
      const next = [...path, key];
      if (Object.hasOwn(node, '$value')) {
        entries.push({ scope, path: next, type: typeof node.$type === 'string' ? node.$type : type, value: node.$value });
      } else collect(node, next, type, scope);
    }
  }
  collect(document, []);
  const extension = object(document.$extensions) ? document.$extensions['org.eidova.export'] : undefined;
  if (object(extension) && object(extension.unsupported)) {
    for (const [path, token] of Object.entries(extension.unsupported)) {
      if (object(token) && Object.hasOwn(token, '$value')) {
        entries.push({ scope: 'unsupported', path: [path], type: typeof token.$type === 'string' ? token.$type : undefined, value: token.$value });
      }
    }
  }
  return entries;
}

export function diffTokens(before: string, after: string, format: 'css' | 'dtcg') {
  const read = format === 'css' ? cssEntries : dtcgEntries;
  const key = ({ scope, path }: Entry) => JSON.stringify([scope, ...path]);
  const oldEntries = new Map(read(before).map(entry => [key(entry), entry]));
  const newEntries = new Map(read(after).map(entry => [key(entry), entry]));
  if (!oldEntries.size && !newEntries.size) throw new Error('No supported token declarations found in either input.');
  return {
    format,
    changes: [...new Set([...oldEntries.keys(), ...newEntries.keys()])].sort((a, b) => {
      const scope = (value: string) => value === 'light' ? 0 : value === 'dark' ? 1 : 2;
      const aa = JSON.parse(a), bb = JSON.parse(b);
      return scope(aa[0]) - scope(bb[0]) || a.localeCompare(b);
    }).flatMap(id => {
      const oldToken = oldEntries.get(id), newToken = newEntries.get(id);
      if (isDeepStrictEqual(oldToken, newToken)) return [];
      const { scope, path } = (newToken ?? oldToken)!;
      return [{
        scope, path,
        kind: !oldToken ? 'added' : !newToken ? 'removed' : 'changed',
        before: oldToken && { type: oldToken.type, value: oldToken.value },
        after: newToken && { type: newToken.type, value: newToken.value },
      }];
    }),
  };
}
