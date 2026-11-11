// Launch the owner's offline archive directly, preserving MCP stdin/stdout.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const archive=process.argv[2];
if (!archive || process.argv.length!==3) {
  throw new Error('Usage: node scripts/start-private.mjs <private-archive-directory>');
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(archive);
process.env.EIDOVA_CONTENT_LIBRARY=path.join(directory,'effective-library.json');
process.env.EIDOVA_PRIVATE_ARCHIVE=directory;
process.env.EIDOVA_STATE_DIR ??= process.env.OPEN_DESIGN_STATE_DIR ?? path.join(root,'.open-design/state');
await import(pathToFileURL(path.join(root,'dist/stdio.js')).href);
