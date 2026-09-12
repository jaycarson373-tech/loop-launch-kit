import { createClient } from '@libsql/client';
import type { LoopEnv } from './env';
import { SqlDatabase, SqlArtworkStore } from './sql-storage';

let database: SqlDatabase | undefined;
function db() {
  if (database) return database;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url)
    throw new Error('Set TURSO_DATABASE_URL and run npm run db:migrate.');
  if (process.env.VERCEL && !/^(libsql|https):\/\//.test(url))
    throw new Error(
      'Vercel requires a remote database; local files are not persistent.',
    );
  database = new SqlDatabase(
    createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }),
  );
  return database;
}

export function platformRuntime(): LoopEnv {
  return {
    ...process.env,
    AUTH_MODE: 'password',
    get DB() {
      return db();
    },
    get ASSETS() {
      return new SqlArtworkStore(db());
    },
  };
}
