import { parseArgs } from 'node:util';
import { z } from 'zod';
import { StudioClient } from './studio-client.js';
import { transferStudioFile } from './studio-transfer.js';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    directory: { type: 'string' }, project: { type: 'string' }, path: { type: 'string' }, 'expected-version': { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    process.stdout.write('Usage: studio-transfer upload|download --directory <project folder> --project <shared project UUID> --path <relative file> [--expected-version <current project version>]\nSet EIDOVA_STUDIO_URL and EIDOVA_STUDIO_KEY. Upload sends only the named file. Download never overwrites an existing file.\n');
  } else {
    if (positionals.length !== 1 || !['upload', 'download'].includes(positionals[0]) || !values.directory || !values.path) throw new Error('Specify upload|download, --directory, --project and --path. Run --help for usage.');
    const projectId = z.string().uuid().parse(values.project);
    if (values['expected-version'] !== undefined && !/^\d+$/.test(values['expected-version'])) throw new Error('Expected version must be a nonnegative integer.');
    const result = await transferStudioFile(new StudioClient(process.env.EIDOVA_STUDIO_URL ?? 'http://127.0.0.1:3210', process.env.EIDOVA_STUDIO_KEY ?? ''), {
      direction: positionals[0] as 'upload' | 'download', directory: values.directory, projectId, path: values.path,
      expectedVersion: values['expected-version'] === undefined ? undefined : Number(values['expected-version']),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  }
} catch (error) { process.stderr.write((error instanceof Error ? error.message : 'Transfer failed.') + '\n'); process.exitCode = 1; }
