import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
type IconSet = { width?: number; height?: number; icons: Record<string, {body: string; width?: number; height?: number}>; aliases?: Record<string, {parent: string}> };
let dataPromise: Promise<IconSet> | undefined;
export async function iconData() {
  dataPromise ??= readFile(require.resolve('@iconify-json/lucide/icons.json'), 'utf8').then(text => JSON.parse(text));
  return dataPromise;
}
export async function iconLibrary() {
  const data = await iconData();
  return { id: 'lucide', name: 'Lucide', prefix: 'lucide', variants: ['outline'], defaultVariant: 'outline', variantFormat: null, iconCount: Object.keys(data.icons).length, matchScore: 1 };
}
export async function iconNames(query: string, limit = 15) {
  const data = await iconData();
  const raw = query.toLowerCase().replace(/^lucide:/, '').replaceAll(' ', '-');
  const q = ({home:'house',close:'x',delete:'trash',warning:'triangle-alert'} as Record<string,string>)[raw] ?? raw;
  return Object.keys(data.icons).filter(name => name.includes(q)).sort((a,b) => Number(b === q) - Number(a === q) || a.localeCompare(b)).slice(0, limit).map(name => `lucide:${name}`);
}
export async function iconSvg(name: string) {
  if (!/^[a-z0-9-]{1,100}$/.test(name)) return null;
  const data = await iconData();
  const icon = data.icons[name] ?? data.icons[data.aliases?.[name]?.parent ?? ''];
  if (!icon) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? data.width ?? 24} ${icon.height ?? data.height ?? 24}">${icon.body}</svg>`;
}
