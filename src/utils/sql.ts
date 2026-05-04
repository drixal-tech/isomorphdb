/**
 * Safely quote an identifier (table name, column name) for Postgres.
 * Prevents SQL injection when interpolating identifiers directly into queries.
 */
export function quoteIdent(ident: string): string {
  return '"' + ident.replace(/"/g, '""') + '"';
}
