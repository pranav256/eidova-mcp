import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';

async function readInput(path: string) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    const max = 4 * 1024 * 1024;
    if (!stat.isFile() || stat.size > max) throw new Error('Expected a regular input file no larger than 4 MB.');
    const buffer = Buffer.alloc(max + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > max) throw new Error('Input exceeds 4 MB.');
    return buffer.toString('utf8', 0, size).replace(/^\uFEFF/, '');
  } finally {
    await file.close();
  }
}

export async function runLocalCommand(command: string, args: string[]) {
  if (command === 'review-browser') {
    const { positionals, values } = parseArgs({ args, allowPositionals: true, options: {
      output: { type: 'string', default: '.work/eidova-review' },
      'ready-selector': { type: 'string' },
    } });
    if (positionals.length !== 1) throw new Error('Usage: eidova-mcp review-browser <loopback-url> [--output <directory>] [--ready-selector <selector>]');
    const { reviewBrowser } = await import('./browser-review.js');
    const result = await reviewBrowser(positionals[0], values.output!, values['ready-selector']);
    if (!result.passed) process.exitCode = 1;
    return result;
  }
  if (command === 'preview-install') {
    const [theme, inventory, ...components] = args;
    if (!theme || !inventory || !components.length) throw new Error('Usage: eidova-mcp preview-install <theme> <inventory.json> <component>...');
    const { previewInstall } = await import('./install-preview.js');
    return previewInstall(theme, components, JSON.parse(await readInput(inventory)));
  }
  const [before, after] = args;
  if (args.length !== 2) throw new Error('Usage: eidova-mcp diff-tokens <before.css|json> <after.css|json>');
  const extension = extname(before).toLowerCase();
  if (!['.css', '.json'].includes(extension) || extension !== extname(after).toLowerCase()) throw new Error('Use two CSS files or two DTCG JSON exports.');
  const { diffTokens } = await import('./token-diff.js');
  const [previous, proposed] = await Promise.all([readInput(before), readInput(after)]);
  return diffTokens(previous, proposed, extension === '.css' ? 'css' : 'dtcg');
}
