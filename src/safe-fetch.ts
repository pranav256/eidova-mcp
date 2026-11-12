import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');

export function publicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}

/** Fetch only an explicitly supplied public URL; pin the validated DNS address. */
export async function safeFetchPublic(input: string, redirects = 0, deadline: AbortSignal = AbortSignal.timeout(20_000)): Promise<Response> {
  deadline.throwIfAborted();
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Use a public HTTP(S) URL without credentials or a custom port.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(hostname) ? [{address: hostname, family: isIP(hostname)}] : await Promise.race([
    lookup(hostname, {all: true}),
    new Promise<never>((_resolve,reject) => {timer=setTimeout(()=>reject(new Error('DNS lookup timed out.')),5000);}),
  ]).finally(()=>clearTimeout(timer));
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private, local and reserved network destinations are not allowed.');
  const selected = addresses[0];
  const response = await new Promise<{status: number; headers: Record<string,string>; body: Buffer}>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)({
      hostname, port: url.port || undefined, path: url.pathname + url.search, method: 'GET',
      signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
      headers: {'Accept': 'text/html,text/css;q=0.9', 'Accept-Encoding': 'identity', 'User-Agent': 'EidovaMCP/0.2'},
      lookup: (_name, options, callback) => options.all
        ? callback(null, [selected])
        : callback(null, selected.address, selected.family),
    }, incoming => {
      const chunks: Buffer[] = []; let bytes = 0;
      incoming.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1_000_000) { request.destroy(new Error('Page exceeds the 1 MB fetch limit.')); return; }
        chunks.push(Buffer.from(chunk));
      });
      incoming.on('error', reject);
      incoming.on('end', () => resolve({status: incoming.statusCode ?? 502, headers: Object.fromEntries(Object.entries(incoming.headers).map(([k,v]) => [k, Array.isArray(v) ? v.join(',') : v ?? ''])), body: Buffer.concat(chunks)}));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Public URL fetch timed out.')));
    request.on('error', reject); request.end();
  });
  if ([301,302,303,307,308].includes(response.status) && response.headers.location) {
    if (redirects >= 3) throw new Error('Too many redirects.');
    return safeFetchPublic(new URL(response.headers.location, url).toString(), redirects + 1, deadline);
  }
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw new Error('Compressed response was refused. Pass the CSS directly instead.');
  const result = new Response([204,205,304].includes(response.status) ? null : new Uint8Array(response.body), {status: response.status, headers: response.headers});
  // Node's pinned transport needs to preserve the final URL for relative stylesheet links.
  Object.defineProperties(result,{url:{value:url.href},redirected:{value:redirects>0}});
  return result;
}
