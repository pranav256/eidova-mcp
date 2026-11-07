import { baseUrl, registryItem } from './catalog.js';
import { iconSvg } from './icons.js';

export function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
}

/** Public immutable assets only: never uses request-scoped credentials or vendor HTTP. */
export async function publicFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
  if (url.origin !== new URL(baseUrl()).origin) return jsonResponse({message:'Only this service’s local registry and icon assets can be fetched by this adapter.'},403);
  const registry = url.pathname.match(/^\/registry\/([a-z0-9_-]+)\/([a-z0-9_-]+)\.json$/);
  if (registry) {
    try { return jsonResponse(await registryItem(registry[1], registry[2])); }
    catch { return jsonResponse({message:'Registry item not found'},404); }
  }
  const icon = url.pathname.match(/^\/icons\/lucide\/([a-z0-9-]+)\.svg$/);
  if (icon) {
    const svg = await iconSvg(icon[1]);
    return svg ? new Response(svg,{headers:{'Content-Type':'image/svg+xml'}}) : jsonResponse({message:'Icon not found'},404);
  }
  return jsonResponse({message:'Public asset route not found'},404);
}

declare global { var __OPEN_DESIGN_PUBLIC_FETCH__: typeof publicFetch }
globalThis.__OPEN_DESIGN_PUBLIC_FETCH__ = publicFetch;
