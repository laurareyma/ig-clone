import { DatabaseSync } from 'node:sqlite';

import { serializeWrites, type SqlDatabase, type SqlValue } from '@/data/local/sql-database';

// SQLite real en memoria para las pruebas, con la misma interfaz que usa la app.
export function createTestDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');

  return serializeWrites({
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params: SqlValue[]) {
      return { changes: Number(db.prepare(sql).run(...params).changes) };
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  });
}
