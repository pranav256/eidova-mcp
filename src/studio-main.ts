import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createStudioBackend } from './studio-backend.js';
import { StudioStore } from './studio-store.js';
import { studioBackendConfig } from './studio-config.js';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('The Studio backend requires Node 24 or later.');
const { file, port, host, origins, registrationKey } = studioBackendConfig();
mkdirSync(dirname(file), { recursive: true });
const db = new DatabaseSync(file);
const server = createStudioBackend(new StudioStore(db), origins, { registrationKey }).listen(port, host, () => process.stderr.write(`Eidova Studio backend listening on port ${port}\n`));
server.requestTimeout = 120000;
server.headersTimeout = 15000;
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  if (closing) return; closing = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10000); deadline.unref();
  server.close(() => { clearTimeout(deadline); db.close(); });
});
