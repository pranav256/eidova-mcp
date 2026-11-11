import { parseArgs } from 'node:util';
import { checkStudioDatabase, copyStudioDatabase } from './studio-backup.js';

const { positionals, values } = parseArgs({ options: { database: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } }, allowPositionals: true });
if (values.help) {
  process.stdout.write('studio:backup check | backup | restore --database <source.sqlite> [--output <new.sqlite>]\nBackup and restore create a new file; existing destinations are never replaced. Stop the service before switching it to a restored database.\n');
} else {
  const action = positionals[0];
  if (positionals.length !== 1 || !['check', 'backup', 'restore'].includes(action!)) throw new Error('Use check, backup or restore; pass --help for usage.');
  const source = values.database ?? process.env.EIDOVA_STUDIO_DB;
  if (!source || action !== 'check' && !values.output || action === 'check' && values.output) throw new Error('Supply --database and, for backup/restore, --output pointing at a new destination.');
  const report = action === 'check' ? await checkStudioDatabase(source) : await copyStudioDatabase(source, values.output!);
  process.stdout.write(JSON.stringify({ operation: action, verified: true, ...report }) + '\n');
}
