import { openDatabaseAsync } from 'expo-sqlite';

import { migrate } from '@/data/local/migrations';
import type { SqlDatabase } from '@/data/local/sql-database';

let database: Promise<SqlDatabase> | undefined;

// Abre la base una sola vez. Quien la pida mientras se abre o migra espera la misma
// promesa, así que nadie consulta un esquema a medio migrar.
export function getDatabase(): Promise<SqlDatabase> {
  database ??= (async () => {
    const db = await openDatabaseAsync('app.db');
    // WAL permite leer mientras se escribe; no se puede activar dentro de una transacción.
    await db.execAsync('PRAGMA journal_mode = WAL');
    await migrate(db);
    return db;
  })();

  return database;
}
