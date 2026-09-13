import { createClient } from '@libsql/client';
import type { LoopEnv } from './env';
import { SqlDatabase, SqlArtworkStore } from './sql-storage';
import { migrateDatabase } from './migrate-database';

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
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  database = new SqlDatabase(client, () => migrateDatabase(client));
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
