import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, writeFile, rename, link, unlink, open, realpath } from 'node:fs/promises';
import { z } from 'zod';
import { StudioClient, studioPath } from './studio-client.js';
import { studioLocalPath } from './studio-transfer.js';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/).nullable();
const stateSchema = z.object({ backend: z.string(), projectId: z.string().uuid(), paths: z.array(studioPath), baseline: z.record(z.string(), hash) });
const filesSchema = z.object({ project: z.object({ version: z.number().int().nonnegative() }), files: z.array(z.object({ path: studioPath, sha256: hash.refine(value => value !== null) })).max(1000) });

async function localFile(directory: string, path: string): Promise<Buffer | null> {
  try {
    const target = await studioLocalPath(directory, path), info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Sync requires regular files: ' + path);
    if (info.size > 8 * 1024 * 1024) throw new Error('Each file can be up to 8 MiB: ' + path);
    return await readFile(target);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Three-way sync of an explicit file set; conflicting changes never pick a winner. */
export async function syncStudioProject(client: StudioClient, input: { directory: string; projectId: string; paths: string[]; signal?: AbortSignal }) {
  const directory = await realpath(input.directory);
  z.string().uuid().parse(input.projectId);
  const paths = z.array(studioPath).min(1).max(1000).parse(input.paths).sort();
  if (new Set(paths.map(path => path.toLowerCase())).size !== paths.length || paths.some(path => path.toLowerCase().split('/')[0] === '.eidova-sync')) throw new Error('Choose distinct paths outside .eidova-sync.');
  const statePath = await studioLocalPath(directory, '.eidova-sync/state.json', true);
  const lockPath = await studioLocalPath(directory, '.eidova-sync/lock');
  const lock = await open(lockPath, 'wx', 0o600).catch(error => { if (error.code === 'EEXIST') throw new Error('Another sync is active, or a stopped process left .eidova-sync/lock. Verify no sync is running before removing that lock.'); throw error; });
  try {
    await lock.writeFile(String(process.pid));
    const stateBytes = await localFile(directory, '.eidova-sync/state.json');
    const state = stateBytes ? stateSchema.parse(JSON.parse(stateBytes.toString('utf8'))) : { backend: client.url, projectId: input.projectId, paths, baseline: {} as Record<string, string | null> };
    if (state.backend !== client.url || state.projectId !== input.projectId || JSON.stringify(state.paths) !== JSON.stringify(paths)) throw new Error('This directory is bound to a different backend, project, or file set. Use a separate directory.');
    const route = '/api/projects/' + input.projectId;
    const remote = filesSchema.parse(await client.json(route + '/files', 'GET', undefined, input.signal));
    const remoteHashes = new Map(remote.files.map(file => [file.path, file.sha256]));
    const local = new Map<string, Buffer | null>(), uploads: { path: string; content: string; encoding: 'base64' }[] = [], deletes: string[] = [], downloads: string[] = [], conflicts: string[] = [];
    for (const path of paths) {
      const bytes = await localFile(directory, path); local.set(path, bytes);
      const localHash = bytes === null ? null : digest(bytes), remoteHash = remoteHashes.get(path) ?? null;
      const base = Object.hasOwn(state.baseline, path) ? state.baseline[path] : null;
      if (localHash === remoteHash) continue;
      const localChanged = localHash !== base, remoteChanged = remoteHash !== base;
      if (localChanged && remoteChanged) conflicts.push(path);
      else if (localChanged) {
        if (bytes === null) deletes.push(path);
        else uploads.push({ path, content: bytes.toString('base64'), encoding: 'base64' });
      } else downloads.push(path);
    }
    if (conflicts.length) return { status: 'conflict' as const, conflicts, uploaded: 0, downloaded: 0, version: remote.project.version };
    let version = remote.project.version;
    if (uploads.length || deletes.length) {
      const committed = await client.json(route + '/commit', 'POST', { files: uploads, deletedPaths: deletes, expectedVersion: version, message: 'Synced local project files' }, input.signal);
      version = z.number().int().nonnegative().parse(committed.version);
    }
    let snapshot: { files: { path: string; content: string; sha256: string }[] } | undefined;
    if (downloads.some(path => remoteHashes.has(path))) {
      snapshot = await client.json(route + '/snapshot?version=' + version, 'GET', undefined, input.signal);
      if (!snapshot || !Array.isArray(snapshot.files)) throw new Error('The backend returned an invalid snapshot.');
    }
    const backups: string[] = [];
    for (const path of downloads) {
      input.signal?.throwIfAborted();
      const before = local.get(path)!, now = await localFile(directory, path);
      if ((before === null ? null : digest(before)) !== (now === null ? null : digest(now))) throw new Error('The local file changed during sync: ' + path + '. Retry after saving your edits.');
      const target = await studioLocalPath(directory, path, true);
      const remoteHash = remoteHashes.get(path) ?? null;
      const incoming = snapshot?.files.find(file => file.path === path);
      const bytes = incoming ? Buffer.from(incoming.content, 'base64') : null;
      if (remoteHash !== null && (!bytes || bytes.length > 8 * 1024 * 1024 || digest(bytes) !== remoteHash)) throw new Error('Snapshot integrity check failed for ' + path);
      // Moving the old file to a retained backup preserves edits even across a crash.
      if (now !== null) {
        const backupRelative = '.eidova-sync/backups/' + randomUUID() + '/' + path;
        const backup = await studioLocalPath(directory, backupRelative, true);
        await rename(target, backup); backups.push(backupRelative);
        if (digest(await readFile(backup)) !== digest(now)) {
          await link(backup, target).catch(() => { /* A concurrent writer already owns the canonical path; the backup remains intact. */ });
          throw new Error('The local file changed during sync. Recover its retained backup at ' + backupRelative);
        }
      }
      if (bytes !== null) {
        const staging = await studioLocalPath(directory, '.eidova-sync/staging-' + randomUUID());
        await writeFile(staging, bytes, { flag: 'wx', mode: 0o600 });
        try { await link(staging, target); }
        catch (error) { throw new Error('The local file could not be installed without overwriting work: ' + path + '. Original files remain in .eidova-sync/backups.', { cause: error }); }
        finally { await unlink(staging); }
      }
    }
    const nextHashes = new Map(remoteHashes);
    for (const file of uploads) nextHashes.set(file.path, digest(Buffer.from(file.content, 'base64')));
    for (const path of deletes) nextHashes.delete(path);
    state.baseline = Object.fromEntries(paths.map(path => [path, nextHashes.get(path) ?? null]));
    const staging = await studioLocalPath(directory, '.eidova-sync/state-' + randomUUID());
    await writeFile(staging, JSON.stringify(state) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(staging, statePath);
    return { status: 'synced' as const, version, uploaded: uploads.length, deleted: deletes.length, downloaded: downloads.length, backups };
  } finally { await lock.close(); await unlink(lockPath); }
}
