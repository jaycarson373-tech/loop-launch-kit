export type SqlValue = string | number | null | ArrayBuffer;
export type SqlResult<T = Record<string, unknown>> = {
  results: T[];
  meta: { changes: number };
};
export interface Statement {
  bind(...values: SqlValue[]): Statement;
  run(): Promise<SqlResult>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<SqlResult[]>;
}
export interface ArtworkStore {
  get(id: string): Promise<{
    body: BodyInit;
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(
    id: string,
    data: ArrayBuffer,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  head(id: string): Promise<unknown>;
}
