import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../../eidova-studio/', import.meta.url));
const { positionals, values } = parseArgs({ options: { 'daemon-port': { type: 'string', default: '7456' }, 'web-port': { type: 'string', default: '7457' }, backend: { type: 'boolean' } }, allowPositionals: true });
const action = positionals[0] ?? 'check';
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('The upstream Studio toolchain requires Node 24.');
if (positionals.length > 1 || !['check', 'install', 'start', 'stop', 'mcp'].includes(action)) throw new Error('Use studio.mjs check | install | start | stop | mcp.');
if (values.backend && action !== 'check') throw new Error('--backend is available only with studio:check.');
for (const value of [values['daemon-port'], values['web-port']]) if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error('Ports must be integers from 1 to 65535.');
if (!existsSync(resolve(root, 'package.json'))) throw new Error('The sibling eidova-studio checkout is missing. See docs/STUDIO.md.');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (manifest.packageManager !== 'pnpm@10.33.2') throw new Error('Studio must use its pinned pnpm@10.33.2 toolchain.');
const cli = resolve(root, 'apps/daemon/bin/od.mjs');
const daemonBuilt = existsSync(resolve(root, 'apps/daemon/dist/cli.js'));
const corepack = resolve(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js');
if (action === 'check') {
  let backend;
  if (values.backend) {
    // Node 24 can execute this dependency-free adapter without installing the native engine.
    const { createEidovaWorkspaceAuthority, readEidovaConnection } = await import(new URL('../../eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts', import.meta.url).href);
    const config = readEidovaConnection();
    const directory = await createEidovaWorkspaceAuthority(config).directory();
    backend = directory.ok
      ? { configured: true, verified: true, workspaceId: directory.items[0].workspaceId, memberId: directory.items[0].workspaceMemberId, providerMode: 'personal_byok' }
      : { configured: Boolean(config), verified: false, reason: directory.reason, ...(directory.status ? { status: directory.status } : {}) };
  }
  process.stdout.write(JSON.stringify({ source: root, version: manifest.version, packageManager: manifest.packageManager, dependenciesInstalled: existsSync(resolve(root, 'node_modules/.pnpm')), daemonBuilt, corepackAvailable: existsSync(corepack), runtimeVerified: false, ...(backend ? { backend } : {}) }) + '\n');
  process.exit(daemonBuilt && (!backend || backend.verified) ? 0 : 1);
}
if (action === 'mcp' && !daemonBuilt) throw new Error('Install Studio dependencies, then build the daemon through studio:start or pnpm --filter @open-design/daemon build; the daemon is not available yet.');
if (action !== 'mcp' && !existsSync(corepack)) throw new Error('Corepack is required to run the pinned Studio package manager. Install it in your regular terminal.');
if (action === 'start') {
  const { readEidovaConnection } = await import(new URL('../../eidova-studio/apps/daemon/src/collab/eidova-workspace-context.ts', import.meta.url).href);
  if (!readEidovaConnection()) throw new Error('Set EIDOVA_STUDIO_URL and EIDOVA_STUDIO_KEY before starting your own-backend Studio. See docs/STUDIO.md.');
  if (!process.env.OD_DATA_DIR || !isAbsolute(process.env.OD_DATA_DIR)) throw new Error('Set OD_DATA_DIR to an absolute directory for native Studio data. Follow eidova-studio/AGENTS.md, Daemon data directory contract.');
}
const args = action === 'mcp' ? [cli, 'mcp', '--daemon-url', 'http://127.0.0.1:' + values['daemon-port']]
  : [corepack, 'pnpm', ...(action === 'install' ? ['install', '--frozen-lockfile'] : ['tools-dev', action === 'start' ? 'run' : 'stop', ...(action === 'start' ? ['web', '--daemon-port', values['daemon-port'], '--web-port', values['web-port']] : []), '--namespace', 'eidova'])];
const { stripEidovaBackendCredentials } = await import(new URL('../../eidova-studio/apps/daemon/src/runtimes/eidova-env.ts', import.meta.url).href);
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: { ...(action === 'start' ? process.env : stripEidovaBackendCredentials(process.env)), ...(action === 'start' ? { OD_WORKSPACE_CONTEXT_SOURCE: 'eidova' } : {}), OD_PORT: values['daemon-port'], OD_WEB_PORT: values['web-port'], POSTHOG_KEY: '', NEXT_PUBLIC_POSTHOG_KEY: '' } });
child.on('error', error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
