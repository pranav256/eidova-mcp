import { z } from 'zod';

export const studioPath = z.string().min(1).max(1000).refine(value =>
  !/[\\\x00-\x1f:<>"|?*]/.test(value) && !value.split('/').some(part => !part || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
  'Use a relative project file path.');

/** Credentials go only to the operator-configured backend, never to a redirect. */
export class StudioClient {
  readonly url: string;
  constructor(url: string, private readonly key: string) {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Use an HTTPS Studio URL, or HTTP on loopback, without credentials or query parameters.');
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Set EIDOVA_STUDIO_KEY to your complete workspace key.');
    this.url = parsed.href.replace(/\/$/, '');
  }
  async request(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    const response = await fetch(this.url + path, {
      method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      headers: { Authorization: 'Bearer ' + this.key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`Studio ${response.status}: ${typeof data.error === 'string' ? data.error : 'The request failed. Retry after checking your backend.'}`);
    }
    return response;
  }
  async json(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
    const response = await this.request(path, method, body, signal);
    return response.status === 204 ? { ok: true } : response.json();
  }
}
