export type CssRules = { [key: string]: string | CssRules };
export type TokenScopes = {light: Record<string, string>; dark: Record<string, string>};

export function mergeCssRules(target: CssRules, incoming: CssRules): CssRules {
  for (const [key, value] of Object.entries(incoming)) {
    const current = target[key];
    target[key] = typeof value === 'string' ? value : mergeCssRules(typeof current === 'object' ? current : {}, value);
  }
  return target;
}

/**
 * Converts trusted upstream CSS to shadcn's inline `css` representation. Quotes,
 * parentheses and brackets keep delimiters inside values from ending a rule.
 * Imports belong to the consumer's existing Tailwind entry point; the registry
 * installs the CSS dependencies and inserts rules into that configured file.
 */
export function cssRules(source: string): CssRules {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let cursor = 0;
  function block(): CssRules {
    const rules: CssRules = {};
    while (cursor < css.length) {
      while (/\s/.test(css[cursor] ?? '') && cursor < css.length) cursor++;
      if (css[cursor] === '}') { cursor++; break; }
      const start = cursor;
      let quote = '';
      let depth = 0;
      while (cursor < css.length) {
        const char = css[cursor];
        if (quote) {
          if (char === '\\') { cursor += 2; continue; }
          if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        else if (depth === 0 && (char === '{' || char === ';' || char === '}')) break;
        cursor++;
      }
      const statement = css.slice(start, cursor).trim();
      const delimiter = css[cursor];
      if (delimiter === '{') {
        cursor++;
        if (statement) mergeCssRules(rules, { [statement]: block() });
        else block();
      } else {
        if (statement && !/^@(?:import|charset|custom-variant)\b/i.test(statement)) {
          if (statement.startsWith('@')) rules[statement] = {};
          else {
            const colon = statement.indexOf(':');
            if (colon > 0) rules[statement.slice(0, colon).trim()] = statement.slice(colon + 1).trim();
          }
        }
        if (delimiter === ';') cursor++;
        else if (delimiter === '}') { cursor++; break; }
        else break;
      }
    }
    return rules;
  }
  return block();
}

export function tokenScopes(css: string): TokenScopes {
  const scopes: TokenScopes = { light: {}, dark: {} };
  for (const [selector, declarations] of Object.entries(cssRules(css))) {
    if (typeof declarations !== 'object') continue;
    const tokens = Object.fromEntries(Object.entries(declarations).filter(([name, value]) => name.startsWith('--') && typeof value === 'string')) as Record<string, string>;
    for (const part of selector.split(',').map(value => value.trim())) {
      if (part === ':root') Object.assign(scopes.light, tokens);
      if (['.dark', ':root.dark', 'html.dark'].includes(part)) Object.assign(scopes.dark, tokens);
    }
  }
  return scopes;
}

/** Structural type keeps this converter independent of catalog/project loaders. */
type InlineItem = {
  css?: unknown;
  cssVars?: Record<string, Record<string, string>>;
  dependencies?: string[];
  files?: { path: string; content: string; type?: string; target?: string }[];
};

/** Inline trusted registry CSS into shadcn's configured stylesheet. */
export function inlineRegistryCss<T extends InlineItem>(item: T, css: string, removeDetachedCss = false): T {
  const scopes = tokenScopes(css);
  const names = (tokens: Record<string, string>) => Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name.replace(/^--/, ''), value]));
  const previous = item.cssVars ?? {};
  const light = {...names(previous.light ?? {}), ...names(scopes.light)};
  const dark = {...light, ...names(previous.dark ?? {}), ...names(scopes.dark)};
  const styles = mergeCssRules((item.css ?? {}) as CssRules, cssRules(css));
  const theme = names(previous.theme ?? {});
  // shadcn treats property keys below css at-rules as selectors. Theme
  // declarations must use cssVars.theme; keyframes use top-level css rules.
  for (const key of Object.keys(styles).filter(key => /^@theme(?:\s|$)/.test(key))) {
    const definitions = styles[key];
    if (typeof definitions === 'object') {
      for (const [name, value] of Object.entries(definitions)) {
        if (name.startsWith('--') && typeof value === 'string') theme[name.slice(2)] = value;
        else if (name.startsWith('@keyframes') && typeof value === 'object') mergeCssRules(styles, {[name]: value});
      }
    }
    delete styles[key];
  }
  // Known package imports are hoisted by the real shadcn formatter. Font
  // imports are limited to the providers used by the trusted source assets.
  for (const dependency of ['tailwindcss', 'tw-animate-css']) {
    if (new RegExp(`@import\\s+["']${dependency}["']\\s*;`).test(css)) styles[`@import "${dependency}"`] = {};
  }
  for (const [, url] of css.matchAll(/@import\s+url\(["']?(https:\/\/fonts\.(?:googleapis\.com|bunny\.net)\/[^"')]+)["']?\)[^;]*;/g)) {
    styles[`@import url("${url}")`] = {};
  }
  item.cssVars = {...previous, theme, light, dark};
  item.css = styles;
  item.dependencies = [...new Set([...(item.dependencies ?? []), 'tailwindcss', 'tw-animate-css'])];
  if (removeDetachedCss) item.files = item.files?.filter(file => !file.path.endsWith('.css')) ?? [];
  return item;
}

