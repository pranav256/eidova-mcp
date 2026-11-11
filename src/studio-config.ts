import { resolve } from 'node:path';

export function studioBackendConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL) throw new Error('Studio needs a persistent service and SQLite disk; it cannot run in a Vercel function.');
  const rawPort = env.EIDOVA_STUDIO_PORT ?? env.PORT ?? '3210';
  const port = Number(rawPort);
  if (!/^\d{1,5}$/.test(rawPort) || port < 1 || port > 65535) throw new Error('Invalid EIDOVA_STUDIO_PORT or PORT.');
  const host = env.EIDOVA_STUDIO_HOST ?? '127.0.0.1';
  if (!host || /[\s/@?#]/.test(host)) throw new Error('Use a bind hostname or IP address in EIDOVA_STUDIO_HOST.');
  const registrationKey = env.EIDOVA_STUDIO_REGISTRATION_KEY;
  if (registrationKey !== undefined && (registrationKey.length < 32 || registrationKey.length > 256)) throw new Error('EIDOVA_STUDIO_REGISTRATION_KEY must contain 32–256 characters.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !registrationKey) throw new Error('Set EIDOVA_STUDIO_REGISTRATION_KEY before exposing the backend beyond loopback.');
  const origins = (env.EIDOVA_STUDIO_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(value => {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('EIDOVA_STUDIO_ORIGINS requires exact HTTPS origins; HTTP is allowed on loopback.');
    return url.origin;
  });
  return { port, host, origins: [...new Set(origins)], registrationKey, file: resolve(env.EIDOVA_STUDIO_DB ?? '.eidova/studio.sqlite') };
}
