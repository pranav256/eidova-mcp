import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { StudioClient } from './studio-client.js';
import { syncStudioProject } from './studio-sync.js';

const stop = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop.abort());
try {
  const { values } = parseArgs({ options: { directory: { type: 'string' }, project: { type: 'string' }, file: { type: 'string', multiple: true }, watch: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) process.stdout.write('Usage: studio-sync --directory <folder> --project <UUID> --file index.html [--file tokens.css] [--watch]\nUses EIDOVA_STUDIO_URL/KEY. Synchronizes only named files, including deletions after the first sync. Conflicts stop without choosing a winner; downloaded replacements keep local backups in .eidova-sync. Do not select credentials.\n');
  else {
    if (!values.directory || !values.project || !values.file?.length) throw new Error('Provide --directory, --project and at least one --file.');
    const client = new StudioClient(process.env.EIDOVA_STUDIO_URL ?? 'http://127.0.0.1:3210', process.env.EIDOVA_STUDIO_KEY ?? '');
    do {
      const result = await syncStudioProject(client, { directory: values.directory, projectId: values.project, paths: values.file, signal: stop.signal });
      if (!values.watch || result.status === 'conflict' || result.uploaded || result.downloaded || result.deleted) process.stdout.write(JSON.stringify(result) + '\n');
      if (result.status === 'conflict') { process.exitCode = 2; break; }
      if (values.watch) await setTimeout(2000, undefined, { signal: stop.signal });
    } while (values.watch && !stop.signal.aborted);
  }
} catch (error) {
  if (!stop.signal.aborted) { process.stderr.write((error instanceof Error ? error.message : 'Sync failed.') + '\n'); process.exitCode = 1; }
}
