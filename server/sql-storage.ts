import type { Client, ResultSet } from '@libsql/client';
import type {
  Database,
  SqlResult,
  SqlValue,
  Statement,
  ArtworkStore,
} from './contracts.ts';

function result<T = Record<string, unknown>>(value: ResultSet): SqlResult<T> {
  return {
    results: value.rows.map((row) =>
      Object.fromEntries(Object.entries(row)),
    ) as T[],
    meta: { changes: value.rowsAffected },
  };
}
class SqlStatement implements Statement {
  readonly database: SqlDatabase;
  readonly query: { sql: string; args: SqlValue[] };
  constructor(database: SqlDatabase, sql: string, args: SqlValue[] = []) {
    this.database = database;
    this.query = { sql, args };
  }
  bind(...values: SqlValue[]) {
    return new SqlStatement(this.database, this.query.sql, values);
  }
  async run() {
    await this.database.ensureReady();
    return result(await this.database.client.execute(this.query));
  }
  async all<T = Record<string, unknown>>() {
    await this.database.ensureReady();
    return result<T>(await this.database.client.execute(this.query));
  }
  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
}
export class SqlDatabase implements Database {
  readonly client: Client;
  private readonly initialize?: () => Promise<void>;
  private ready?: Promise<void>;
  constructor(client: Client, initialize?: () => Promise<void>) {
    this.client = client;
    this.initialize = initialize;
  }
  async ensureReady() {
    this.ready ??= (this.initialize?.() ?? Promise.resolve()).catch((error) => {
      this.ready = undefined;
      throw error;
    });
    await this.ready;
  }
  prepare(sql: string) {
    return new SqlStatement(this, sql);
  }
  async batch(statements: Statement[]) {
    await this.ensureReady();
    const queries = statements.map((statement) => {
      if (!(statement instanceof SqlStatement) || statement.database !== this)
        throw new Error('Batch statements must belong to this database.');
      return statement.query;
    });
    // libSQL write batches are atomic: a failure rolls back every statement.
    return (await this.client.batch(queries, 'write')).map((value) =>
      result(value),
    );
  }
}
export class SqlArtworkStore implements ArtworkStore {
  readonly database: SqlDatabase;
  constructor(database: SqlDatabase) {
    this.database = database;
  }
  async put(
    id: string,
    data: ArrayBuffer,
    options: { httpMetadata: { contentType: string } },
  ) {
    return this.database
      .prepare(
        'INSERT INTO artwork_blobs (id, data, mime) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, mime=excluded.mime',
      )
      .bind(id, data, options.httpMetadata.contentType)
      .run();
  }
  async head(id: string) {
    return this.database
      .prepare('SELECT id FROM artwork_blobs WHERE id=?')
      .bind(id)
      .first();
  }
  async get(id: string) {
    const row = await this.database
      .prepare('SELECT data, mime FROM artwork_blobs WHERE id=?')
      .bind(id)
      .first<{ data: ArrayBuffer; mime: string }>();
    if (!row) return null;
    return {
      body: row.data,
      arrayBuffer: async () => row.data,
      httpMetadata: { contentType: row.mime },
    };
  }
}
