import { createClient } from '@libsql/client';
import { migrateDatabase } from '../server/migrate-database.ts';

const url = process.env.TURSO_DATABASE_URL;
if (!url)
  throw new Error(
    'Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for a remote database).',
  );
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await migrateDatabase(client);
  console.log('Loop database migrations are current.');
} finally {
  client.close();
}
