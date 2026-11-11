import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { StudioClient, studioPath } from './studio-client.js';

export async function studioLocalPath(directory: string, relativePath: string, createParents = false) {
  const path = studioPath.parse(relativePath);
  let target = await realpath(directory);
  const root = await lstat(target);
  if (!root.isDirectory()) throw new Error('Choose a project directory.');
  const parts = path.split('/');
  for (const part of parts.slice(0, -1)) {
    target = join(target, part);
    if (createParents) await mkdir(target).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Transfers cannot traverse links or non-directories.');
  }
  return join(target, parts.at(-1)!);
}

/** An explicit file transfer, usable with a Studio project directory or any checkout. */
export async function transferStudioFile(client: StudioClient, input: {
  direction: 'upload' | 'download'; directory: string; projectId: string; path: string; expectedVersion?: number;
}) {
  const path = studioPath.parse(input.path);
  const target = await studioLocalPath(input.directory, path, input.direction === 'download');
  const route = '/api/projects/' + encodeURIComponent(input.projectId) + '/file';
  if (input.direction === 'upload') {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion! < 0) throw new Error('Upload requires the current expected project version.');
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Upload a regular file, not a link.');
    if (info.size > 8 * 1024 * 1024) throw new Error('Each file can be up to 8 MiB.');
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const bytes = await handle.readFile();
      if (bytes.length > 8 * 1024 * 1024) throw new Error('Each file can be up to 8 MiB.');
      return await client.json(route, 'PUT', { path, content: bytes.toString('base64'), encoding: 'base64', expectedVersion: input.expectedVersion });
    } finally { await handle.close(); }
  }
  const response = await client.request(route + '?path=' + encodeURIComponent(path));
  const bytes = Buffer.from(await response.arrayBuffer());
  // Exclusive creation makes downloading safe beside unsaved native Studio edits.
  const handle = await open(target, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('The local file already exists. Download into a separate directory, then compare and merge your edits.');
    throw error;
  });
  try { await handle.writeFile(bytes); }
  catch (error) { await handle.close(); await unlink(target); throw error; }
  finally { await handle.close(); }
  return { path, directory: dirname(target), bytes: bytes.length, sha256: response.headers.get('etag')?.replaceAll('"', '') };
}
