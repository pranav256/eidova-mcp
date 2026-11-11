import { backup, DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmod, link, lstat, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

function validate(db: DatabaseSync) {
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Database integrity check failed.');
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if (version < 1 || version > 3) throw new Error('Use a supported Eidova Studio database (schema 1–3).');
  for (const table of ['workspaces', 'members', 'projects', 'revisions', 'file_revisions', 'shares']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error('This is not an Eidova Studio database.');
  }
  return { schemaVersion: version, workspaces: Number(db.prepare('SELECT count(*) AS n FROM workspaces').get()!.n), projects: Number(db.prepare('SELECT count(*) AS n FROM projects').get()!.n) };
}

async function databaseFile(file: string) {
  if (!(await lstat(file)).isFile()) throw new Error('Use a regular database file, without a symlink.');
  return realpath(file);
}

export async function checkStudioDatabase(file: string) {
  const db = new DatabaseSync(await databaseFile(resolve(file)), { readOnly: true });
  try { return validate(db); } finally { db.close(); }
}

/** SQLite's online backup includes committed WAL pages; exclusive publication never replaces a database. */
export async function copyStudioDatabase(source: string, output: string) {
  source = await databaseFile(resolve(source));
  const directory = await realpath(dirname(resolve(output)));
  output = resolve(directory, basename(resolve(output)));
  const temporary = resolve(directory, '.eidova-backup-' + randomUUID() + '.sqlite');
  const db = new DatabaseSync(source, { readOnly: true });
  let owned = false;
  try {
    validate(db);
    const handle = await open(temporary, 'wx', 0o600); owned = true; await handle.close();
    await backup(db, temporary);
    const copied = new DatabaseSync(temporary);
    let report;
    try { report = validate(copied); copied.exec('PRAGMA journal_mode=DELETE'); } finally { copied.close(); }
    await chmod(temporary, 0o600);
    const durable = await open(temporary, 'r+');
    try { await durable.sync(); } finally { await durable.close(); }
    try { await link(temporary, output); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Output already exists. Choose a new destination; no files were replaced.'); throw error; }
    if (process.platform !== 'win32') {
      const parent = await open(directory, 'r');
      try { await parent.sync(); } finally { await parent.close(); }
    }
    return { ...report, output };
  } finally { db.close(); if (owned) await unlink(temporary); }
}
